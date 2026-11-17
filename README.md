# speardev

The Spearhead Discord bot. It handles:

- **Verification**: links a Discord account to a Roblox account (a code in their Roblox profile "About").
- **Waves**: staff open and close application waves.
- **Applications**: verified players apply through a form, staff accept or deny with one click.
- **Group**: accepted players are let into the Roblox group automatically and land on **Waved**.

---

## How it works for players

1. Press **Verify** on the panel, type their Roblox username, put the code they get into their Roblox **About**, press **Check**.
2. While a wave is open, press **Apply** and answer the questions. Roblox username and profile link are filled in automatically.
3. Staff accept or deny. They get a DM either way (with the reason, if staff gave one).
4. If accepted, they request to join the Roblox group. The bot accepts the request within about a minute and gives them **Waved**.

## Staff commands

| Command | What it does |
|---|---|
| `/setup` | Posts the Verify / Apply panel in the current channel |
| `/wave open name:Wave 3` | Opens a wave (the Apply button turns on) |
| `/wave close` | Closes the wave (shows how many were accepted / denied / still waiting) |
| `/wave status` | Shows the current wave and its numbers |
| `/whois` | Who a member or Roblox account is linked to, and their application status |
| `/unlink` | Removes someone's link so they can verify again |

Applications show up in the review channel with **Accept** and **Deny** buttons. Anyone with the Moderator, Admin or Developer role (or Discord Administrator) can review. Only the first click counts.

## Settings

- Secrets and channel IDs go in `.env` (copy `.env.example`). **Never upload `.env`.**
- Everything else is in `src/config.js`: staff role names, the Verified / Waved Discord roles, group ID and rank, and the application questions.

---

## Setup (one time)

### 1. Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Name it.
2. Open **Bot**, click **Reset Token**, copy the token. This goes in `.env` as `DISCORD_TOKEN`.
3. Open **OAuth2 → URL Generator**. Tick `bot` and `applications.commands`. Under bot permissions tick
   **View Channels, Send Messages, Embed Links, Read Message History, Manage Roles**. Open the link and add the bot to your server.
4. In your server settings → **Roles**, drag the bot's role **above** `Verified` and `Waved`, or it can't give those roles out.

### 2. Discord server

1. Create the roles `Verified` and `Waved` (or change the names in `src/config.js`).
2. Make an applications channel (public) and a review channel (staff only). Optional: a log channel (staff only).
3. Turn on **Developer Mode** (User Settings → Advanced), then right-click to **Copy ID** for the server and channels. These go in `.env`.

### 3. Roblox group and API key

1. Your group must use **manual approval** for join requests (Community settings), otherwise anyone can join without applying.
2. Go to the [Creator Dashboard → Open Cloud → API Keys](https://create.roblox.com/dashboard/credentials) and click **Create API Key**.
   Create it as the group owner, or with the Spearhead group selected.
3. Under **Access Permissions**, add **groups**, pick the Spearhead group, and allow **read** and **write**.
4. Under **Security**, add your server's IP address (or `0.0.0.0/0` to allow any).
5. Save and copy the key. It goes in `.env` as `ROBLOX_API_KEY`.

### 4. Run it on the DigitalOcean server

Connect to your server (DigitalOcean → your Droplet → **Console**), then:

```bash
# Node.js 22 (skip if `node --version` already shows v22.13 or newer)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# GitHub CLI, to download the private repo
sudo apt-get install -y gh
gh auth login            # pick GitHub.com, HTTPS, log in with a browser code

# Download the bot
gh repo clone ironicrealm/speardev
cd speardev
npm install

# Settings
cp .env.example .env
nano .env                # fill in the values, then Ctrl+O, Enter, Ctrl+X

# Check it works
npm test

# Keep it running (and restart it if the server reboots)
sudo npm install -g pm2
pm2 start npm --name speardev -- start
pm2 save
pm2 startup              # run the command it prints
```

Then in Discord: go to the applications channel, run `/setup`, and open a wave with `/wave open`.

### Updating the bot later

```bash
cd speardev
git pull
npm install
pm2 restart speardev
```

Useful: `pm2 logs speardev` shows what the bot is doing, `pm2 status` shows if it's running.

---

## For developers

```
src/
  index.js              starts the bot, routes commands and buttons
  config.js             all settings
  core/database.js      SQLite storage (Node's built-in, no extra install)
  services/             the actual logic, no Discord code in here
    roblox.js           Roblox API (users, group join requests, ranks)
    links.js            Discord <-> Roblox verification
    waves.js            open / close waves
    applications.js     applications and their review result
    groupSync.js        lets accepted players into the group
  discord/              panels, forms, embeds, small helpers
  interactions/         Verify, Apply and Accept / Deny buttons and forms
  commands/             slash commands
tests/                  npm test
```

Needs Node.js 22.13 or newer. Data is kept in `data/speardev.db`.
