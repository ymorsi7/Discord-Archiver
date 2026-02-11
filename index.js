import 'dotenv/config';
import path from 'path';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import { archiveGuild, deleteGuildMessages } from './archive.js';

const token = process.env.DISCORD_TOKEN;
const defaultDir = process.env.OUTPUT_DIR || './archive';
const port = Number(process.env.PORT) || 3000;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const inviteUrl = process.env.INVITE_URL || '';

const landing = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Discord Archiver</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    margin: 0;
    min-height: 100vh;
    background: linear-gradient(160deg, #1a1b26 0%, #16161e 100%);
    color: #a9b1d6;
    line-height: 1.6;
    padding: 2rem 1rem;
  }
  .wrap { max-width: 32rem; margin: 0 auto; }
  h1 {
    font-size: 1.75rem;
    font-weight: 600;
    color: #c0caf5;
    margin: 0 0 0.5rem;
  }
  .tagline { color: #7aa2f7; font-size: 0.95rem; margin-bottom: 1.5rem; }
  .card {
    background: rgba(36, 40, 59, 0.6);
    border: 1px solid rgba(192, 202, 245, 0.08);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  .card h2 { font-size: 0.85rem; color: #7aa2f7; margin: 0 0 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .card p { margin: 0 0 0.5rem; }
  .card p:last-child { margin-bottom: 0; }
  code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.2em 0.45em;
    border-radius: 6px;
    font-size: 0.9em;
    color: #bb9af7;
  }
  a { color: #7aa2f7; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn {
    display: inline-block;
    background: #5865f2;
    color: #fff !important;
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-weight: 500;
    margin-top: 0.5rem;
  }
  .btn:hover { background: #4752c4; text-decoration: none; }
  .help {
    font-size: 0.9rem;
    color: #565f89;
    margin-top: 1rem;
  }
  .help summary { cursor: pointer; color: #7aa2f7; }
  .help ol { margin: 0.5rem 0 0 1.25rem; padding: 0; }
  .help li { margin-bottom: 0.35rem; }
  .source { margin-top: 1.5rem; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Discord Archiver</h1>
  <p class="tagline">Back up your server (messages + files), then optionally delete for privacy.</p>

  <div class="card">
    <h2>Commands</h2>
    <p><code>!archive</code> — Archive the server (progress shown).</p>
    <p><code>!archive-pause</code> / <code>!archive-resume</code> — Pause or resume an in-progress archive.</p>
    <p><code>!archive-delete confirm</code> — Delete messages (run only after you have a backup).</p>
  </div>

  <div class="card">
    <h2>Add the bot</h2>
    ${inviteUrl
      ? `<p><a href="${inviteUrl}" class="btn">Add bot to your server</a></p>`
      : `<p>No invite link set yet.</p>
        <details class="help">
          <summary>How to get the invite link</summary>
          <ol>
            <li>Open <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Discord Developer Portal</a> → your app → <strong>OAuth2</strong> → <strong>URL Generator</strong>.</li>
            <li>Scopes: check <strong>bot</strong>. Permissions: <strong>View Channels</strong>, <strong>Read Message History</strong> (and <strong>Manage Messages</strong> if you want delete).</li>
            <li>Copy the generated URL. Then run: <code>flyctl secrets set INVITE_URL="PASTE_URL_HERE"</code> and redeploy.</li>
          </ol>
        </details>`}
  </div>

  <p class="source"><a href="https://github.com/ymorsi7/Discord-Archiver">Source on GitHub</a></p>
</div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landing);
  } else {
    res.writeHead(200);
    res.end();
  }
});
server.listen(port, '0.0.0.0', () => {});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const archivePaused = new Map();
const PROGRESS_EDIT_INTERVAL_MS = 2500;

client.once('clientReady', () => console.log(`Ready as ${client.user.tag}. Commands: !archive [path] | !archive-pause | !archive-resume | !archive-delete confirm`));

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const [cmd, ...rest] = msg.content.trim().split(/\s+/);
  const arg = rest.join(' ').trim() || null;

  if (cmd?.toLowerCase() === '!archive-pause') {
    archivePaused.set(msg.guild.id, true);
    await msg.reply('Archive paused. Use `!archive-resume` to continue.');
    return;
  }
  if (cmd?.toLowerCase() === '!archive-resume') {
    archivePaused.set(msg.guild.id, false);
    await msg.reply('Archive resumed.');
    return;
  }

  if (cmd?.toLowerCase() === '!archive') {
    const baseDir = arg ? path.resolve(arg) : path.resolve(defaultDir);
    archivePaused.set(msg.guild.id, false);
    const progressMsg = await msg.reply(`Archiving to \`${baseDir}\`…\nChannel 0/${msg.guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread() && c.viewable).size} — 0 messages, 0 attachments`);
    let lastEdit = 0;
    const updateProgress = async (p) => {
      const now = Date.now();
      if (now - lastEdit < PROGRESS_EDIT_INTERVAL_MS) return;
      lastEdit = now;
      const paused = archivePaused.get(msg.guild.id) ? ' **[PAUSED]**' : '';
      try {
        await progressMsg.edit(`Archiving to \`${baseDir}\`…${paused}\nChannel **${p.channelName}** (${p.channelIndex}/${p.totalChannels}) — ${p.messages} messages, ${p.attachments} attachments`);
      } catch (_) {}
    };
    try {
      const r = await archiveGuild(msg.guild, baseDir, {
        onProgress: updateProgress,
        getPaused: () => archivePaused.get(msg.guild.id) ?? false,
      });
      await progressMsg.edit(`Done. ${r.channels} channels, ${r.messages} messages, ${r.attachments} attachments.${r.errors.length ? ` (${r.errors.length} errors)` : ''}`);
    } catch (e) {
      await progressMsg.edit(`Failed: ${e.message}`).catch(() => {});
    } finally {
      archivePaused.delete(msg.guild.id);
    }
    return;
  }

  if (cmd?.toLowerCase() === '!archive-delete') {
    if (arg !== 'confirm') {
      await msg.reply('To delete all messages in this server (after you have a backup), run: `!archive-delete confirm`. Bot needs Manage Messages. Irreversible.');
      return;
    }
    await msg.reply('Deleting… (slow, rate-limited).');
    try {
      const { deleted, errors } = await deleteGuildMessages(msg.guild);
      await msg.reply(`Deleted ${deleted} messages.${errors.length ? ` (${errors.length} errors)` : ''}`);
    } catch (e) {
      await msg.reply(`Failed: ${e.message}`);
    }
  }
});

client.login(token).catch((e) => {
  console.error('Login failed:', e.message);
  process.exit(1);
});
