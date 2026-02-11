# Discord Archiver

Bot that archives an entire Discord server (all text channels: messages + attachments) to a folder. You choose where—external drive, USB, or local disk. Optional: delete messages from the server after archiving.

**Why:** Discord is not end-to-end encrypted and is adding more identity requirements. Keeping a copy and optionally removing data from Discord gives you control.

---

## Use the hosted bot (no setup)

You can use **the bot already running** at **[discord-archiver.fly.dev](https://discord-archiver.fly.dev)**. Click **“Add bot to your server”** on that page, choose your server, then in any channel run `!archive` to back up that server. Archives are stored on the host; for full control and privacy, run the bot yourself (below).

---

## Deploy (default) — Fly.io

Free to run within [Fly.io](https://fly.io)’s allowance. Of the common free hosts, Fly gives you an isolated VM and region choice (e.g. EU); your token and process run there, not in a shared container.

1. **Create the bot**  
   [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot → copy token. Enable **Message Content Intent** under Bot.

2. **Invite the bot**  
   OAuth2 → URL Generator: scope `bot`, permissions **Read Message History**, **View Channels** (and **Manage Messages** if you’ll use delete). Add bot to your server.

3. **Install Fly CLI** (use the official CLI, not the npm package)
   ```bash
   # Mac
   brew install flyctl
   # Linux/WSL
   curl -L https://fly.io/install.sh | sh
   ```
   Then log in once (opens browser): `flyctl auth login`

4. **Deploy**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   Or manually: `flyctl launch --no-deploy --yes`, `flyctl secrets set DISCORD_TOKEN=your_token`, `flyctl deploy`.  
   Archives on Fly are stored in the app filesystem (ephemeral on free usage). To keep archives long-term or maximize privacy, run on your own hardware (below).

---

## Run on your own (recommended for privacy)

For maximum privacy and to keep archives on hardware you control (your PC, NAS, or a machine you own):

- Your bot token and all archived data stay on your machine or the path you choose (e.g. external drive, USB).
- Nothing is stored on a third-party server.

**Setup**

1. Create the bot and invite it (same as step 1–2 above).
2. Locally:
   ```bash
   cp .env.example .env
   # Edit .env: set DISCORD_TOKEN=your_bot_token
   # Optional: OUTPUT_DIR=/path/to/drive/backup
   npm install
   npm start
   ```

Use **`!archive`** (default folder) or **`!archive /path/to/usb`** so the archive is written only where you specify.

---

## Commands

- **`!archive`** — Archive the server to the default folder; the bot edits its message with progress (channel X/Y, messages, attachments).
- **`!archive /path/to/folder`** — Archive to that path (e.g. `/Volumes/MyUSB/backup` or `D:\backup`).
- **`!archive-pause`** / **`!archive-resume`** — Pause or resume an archive in progress (same server).
- **`!archive-delete`** — Shows instructions.
- **`!archive-delete confirm`** — Deletes every message the bot can delete in the server (needs **Manage Messages**). Use only after you have a verified backup. Irreversible.

## Output layout

```
YourChosenFolder/
  ServerName/
    channel-name/
      messages.json   # author, date, content, attachment refs
      attachments/    # downloaded files/images
```

Copy or move that folder to any drive you want.
