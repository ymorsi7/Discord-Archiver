import fs from 'fs/promises';
import path from 'path';

const BATCH = 100;
const DELETE_DELAY = 1100;

const safeName = (s) => (s.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) || 'unnamed');

async function fetchAll(channel) {
  const out = [];
  let before;
  for (;;) {
    const opts = { limit: BATCH };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;
    batch.forEach((m) => out.push(m));
    before = batch.last().id;
    if (batch.size < BATCH) break;
  }
  return out;
}

async function download(url, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': 'Discord-Archiver' } });
  if (!res.ok) throw new Error(res.status);
  await fs.writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

function textChannels(guild) {
  return guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread() && c.viewable);
}

async function waitUnpaused(getPaused) {
  while (getPaused?.()) {
    await new Promise((r) => setTimeout(r, 800));
  }
}

export async function archiveGuild(guild, baseDir, opts = {}) {
  const { onProgress, getPaused } = opts;
  const root = path.join(baseDir, safeName(guild.name));
  await fs.mkdir(root, { recursive: true });
  const stats = { channels: 0, messages: 0, attachments: 0, errors: [] };
  const channels = textChannels(guild);
  const totalChannels = channels.size;
  let channelIndex = 0;

  for (const [, ch] of channels) {
    await waitUnpaused(getPaused);
    channelIndex++;
    const dir = path.join(root, safeName(ch.name));
    const attDir = path.join(dir, 'attachments');
    await fs.mkdir(attDir, { recursive: true });

    let messages;
    try {
      messages = await fetchAll(ch);
    } catch (err) {
      stats.errors.push(`${ch.name}: ${err.message}`);
      if (onProgress) onProgress({ channelName: ch.name, channelIndex, totalChannels, messages: stats.messages, attachments: stats.attachments });
      continue;
    }

    const out = [];
    let n = 0;
    for (const msg of messages) {
      await waitUnpaused(getPaused);
      const rec = {
        id: msg.id,
        author: msg.author?.tag ?? 'unknown',
        authorId: msg.author?.id,
        createdAt: msg.createdAt?.toISOString?.() ?? null,
        content: msg.content || null,
        attachments: [],
      };
      for (const att of msg.attachments.values()) {
        await waitUnpaused(getPaused);
        const ext = path.extname(new URL(att.url).pathname) || '.bin';
        const name = `${String(n).padStart(5, '0')}_${safeName(att.name || att.id + ext)}`;
        const fp = path.join(attDir, name);
        try {
          await download(att.url, fp);
          stats.attachments++;
        } catch (err) {
          stats.errors.push(`att ${att.url}: ${err.message}`);
        }
        rec.attachments.push({ filename: name, url: att.url });
        n++;
      }
      if (msg.embeds?.length) rec.embeds = msg.embeds.map((e) => ({ title: e.title, url: e.url, description: e.description }));
      out.push(rec);
      stats.messages++;
    }
    await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(out, null, 2));
    stats.channels++;
    if (onProgress) onProgress({ channelName: ch.name, channelIndex, totalChannels, messages: stats.messages, attachments: stats.attachments });
  }
  return stats;
}

export async function deleteGuildMessages(guild) {
  const channels = textChannels(guild);
  let deleted = 0;
  const errors = [];
  for (const [, ch] of channels) {
    let messages;
    try {
      messages = await fetchAll(ch);
    } catch (err) {
      errors.push(`${ch.name}: ${err.message}`);
      continue;
    }
    for (const msg of messages) {
      try {
        await msg.delete();
        deleted++;
      } catch (err) {
        if (err.code !== 10008) errors.push(`msg ${msg.id}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, DELETE_DELAY));
    }
  }
  return { deleted, errors };
}
