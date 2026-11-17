const { now } = require("../core/database");

// Tickets: death appeals, general support and event requests.
// status: open -> claimed (support/event) -> closed, or open -> accepted / denied (appeals)
class Tickets {
	constructor(db) {
		this.db = db;
	}

	get(id) {
		const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
		return row ? parse(row) : null;
	}

	byChannel(channelId) {
		const row = this.db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId);
		return row ? parse(row) : null;
	}

	// The open ticket of this type for this person, if any
	openFor(discordId, type) {
		const row = this.db
			.prepare("SELECT * FROM tickets WHERE discord_id = ? AND type = ? AND status IN ('open', 'claimed') LIMIT 1")
			.get(discordId, type);
		return row ? parse(row) : null;
	}

	create({ type, discordId, robloxId = null, answers, kiaId = null }) {
		const result = this.db
			.prepare("INSERT INTO tickets (type, discord_id, roblox_id, answers, kia_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
			.run(type, discordId, robloxId, JSON.stringify(answers), kiaId, now());
		return this.get(result.lastInsertRowid);
	}

	setChannel(id, channelId) {
		this.db.prepare("UPDATE tickets SET channel_id = ? WHERE id = ?").run(channelId, id);
	}

	setMessage(id, messageId) {
		this.db.prepare("UPDATE tickets SET message_id = ? WHERE id = ?").run(messageId, id);
	}

	// Returns null if someone else got there first
	claim(id, staffId) {
		const result = this.db.prepare("UPDATE tickets SET status = 'claimed', claimed_by = ? WHERE id = ? AND status = 'open'").run(staffId, id);
		return result.changes > 0 ? this.get(id) : null;
	}

	// status: accepted / denied / closed / expired
	finish(id, status, staffId, reason = null) {
		const result = this.db
			.prepare(
				"UPDATE tickets SET status = ?, closed_by = ?, reason = ?, closed_at = ? WHERE id = ? AND status IN ('open', 'claimed')"
			)
			.run(status, staffId, reason, now(), id);
		return result.changes > 0 ? this.get(id) : null;
	}

	// Open tickets nobody has claimed or decided for too long
	stale(maxAgeSeconds) {
		return this.db
			.prepare("SELECT * FROM tickets WHERE status = 'open' AND created_at < ?")
			.all(now() - maxAgeSeconds)
			.map(parse);
	}
}

function parse(row) {
	return { ...row, answers: JSON.parse(row.answers) };
}

module.exports = { Tickets };
