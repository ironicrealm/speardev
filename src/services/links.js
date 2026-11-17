const crypto = require("node:crypto");
const { now } = require("../core/database");

// Links Discord accounts to Roblox accounts.
// The player puts a code in their Roblox profile "About", the bot checks it, done.
const WORDS = [
	"spearhead", "juggernaut", "anchor", "reaper", "sector", "eastern", "front",
	"legion", "handler", "processor", "scavenger", "undertaker", "laughing", "fox",
	"gunslinger", "snow", "witch", "republic", "giad", "ninety", "sixth", "raid",
];

class Links {
	constructor(db, roblox, { codeMinutes = 30 } = {}) {
		this.db = db;
		this.roblox = roblox;
		this.codeMinutes = codeMinutes;
	}

	get(discordId) {
		return this.db.prepare("SELECT * FROM links WHERE discord_id = ?").get(discordId) ?? null;
	}

	getByRoblox(robloxId) {
		return this.db.prepare("SELECT * FROM links WHERE roblox_id = ?").get(robloxId) ?? null;
	}

	makeCode() {
		const pick = () => WORDS[crypto.randomInt(WORDS.length)];
		return `${pick()} ${pick()} ${pick()} ${crypto.randomInt(100, 1000)}`;
	}

	// Step 1: player gives their Roblox username, gets a code
	async start(discordId, username) {
		const user = await this.roblox.findUserByName(username.trim());
		if (!user) {
			return { ok: false, reason: `Couldn't find a Roblox account called **${username}**.` };
		}
		const owner = this.getByRoblox(user.id);
		if (owner && owner.discord_id !== discordId) {
			return { ok: false, reason: `**${user.name}** is already linked to another Discord account. Ask staff for help.` };
		}
		const code = this.makeCode();
		this.db
			.prepare(
				`INSERT INTO verifications (discord_id, roblox_id, roblox_name, code, created_at) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(discord_id) DO UPDATE SET roblox_id = excluded.roblox_id, roblox_name = excluded.roblox_name,
				code = excluded.code, created_at = excluded.created_at`
			)
			.run(discordId, user.id, user.name, code, now());
		return { ok: true, code, user };
	}

	// Step 2: check the code is in their profile and save the link
	async check(discordId) {
		const pending = this.db.prepare("SELECT * FROM verifications WHERE discord_id = ?").get(discordId);
		if (!pending) {
			return { ok: false, reason: "Start verification first." };
		}
		if (now() - pending.created_at > this.codeMinutes * 60) {
			this.db.prepare("DELETE FROM verifications WHERE discord_id = ?").run(discordId);
			return { ok: false, reason: "That code expired. Start again for a new one." };
		}
		const user = await this.roblox.getUser(pending.roblox_id);
		if (!user) {
			return { ok: false, reason: "That Roblox account doesn't exist anymore." };
		}
		const about = user.description.toLowerCase().replace(/\s+/g, " ");
		if (!about.includes(pending.code.toLowerCase())) {
			return { ok: false, reason: `The code isn't in **${user.name}**'s About yet. Save it on Roblox, then try again.` };
		}
		const owner = this.getByRoblox(user.id);
		if (owner && owner.discord_id !== discordId) {
			return { ok: false, reason: `**${user.name}** is already linked to another Discord account.` };
		}
		this.db.prepare("DELETE FROM links WHERE discord_id = ?").run(discordId);
		this.db
			.prepare("INSERT INTO links (discord_id, roblox_id, roblox_name, linked_at) VALUES (?, ?, ?, ?)")
			.run(discordId, user.id, user.name, now());
		this.db.prepare("DELETE FROM verifications WHERE discord_id = ?").run(discordId);
		return { ok: true, link: this.get(discordId) };
	}

	unlink(discordId) {
		return this.db.prepare("DELETE FROM links WHERE discord_id = ?").run(discordId).changes > 0;
	}
}

module.exports = { Links };
