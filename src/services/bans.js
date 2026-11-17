const { now } = require("../core/database");

// Soft bans: the person stays in the server but can only see tickets.
class Bans {
	constructor(db) {
		this.db = db;
	}

	active(discordId) {
		return this.db.prepare("SELECT * FROM bans WHERE discord_id = ? AND lifted_at IS NULL ORDER BY id DESC LIMIT 1").get(discordId) ?? null;
	}

	// Returns null if they're already banned
	add(discordId, reason, bannedBy) {
		if (this.active(discordId)) {
			return null;
		}
		const result = this.db
			.prepare("INSERT INTO bans (discord_id, reason, banned_by, created_at) VALUES (?, ?, ?, ?)")
			.run(discordId, reason ?? null, bannedBy, now());
		return this.db.prepare("SELECT * FROM bans WHERE id = ?").get(result.lastInsertRowid);
	}

	// Returns the lifted ban, or null if they weren't banned
	lift(discordId, liftedBy) {
		const ban = this.active(discordId);
		if (!ban) {
			return null;
		}
		this.db.prepare("UPDATE bans SET lifted_at = ?, lifted_by = ? WHERE id = ?").run(now(), liftedBy, ban.id);
		return this.db.prepare("SELECT * FROM bans WHERE id = ?").get(ban.id);
	}

	allActive() {
		return this.db.prepare("SELECT * FROM bans WHERE lifted_at IS NULL").all();
	}
}

module.exports = { Bans };
