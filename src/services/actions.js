const { now } = require("../core/database");

// Things the bot wants the game to do (like voiding a death).
// Game servers ask for pending actions for their players, do them, then report back.
class Actions {
	constructor(db) {
		this.db = db;
	}

	// since: when the death happened, so the game never restores an older backup
	queue({ robloxId, kind, slot = null, since = null, ticketId = null }) {
		const result = this.db
			.prepare("INSERT INTO actions (roblox_id, kind, slot, since, ticket_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
			.run(robloxId, kind, slot, since, ticketId, now());
		return this.get(result.lastInsertRowid);
	}

	get(id) {
		return this.db.prepare("SELECT * FROM actions WHERE id = ?").get(id) ?? null;
	}

	pendingFor(robloxIds) {
		const ids = robloxIds.filter((id) => Number.isInteger(id)).slice(0, 200);
		if (ids.length === 0) {
			return [];
		}
		const marks = ids.map(() => "?").join(",");
		return this.db.prepare(`SELECT * FROM actions WHERE done_at IS NULL AND roblox_id IN (${marks}) ORDER BY id`).all(...ids);
	}

	// Returns the action if this was the first report for it
	finish(id, result) {
		const changed = this.db.prepare("UPDATE actions SET done_at = ?, result = ? WHERE id = ? AND done_at IS NULL").run(now(), result ?? "", id);
		return changed.changes > 0 ? this.get(id) : null;
	}
}

module.exports = { Actions };
