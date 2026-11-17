const { now } = require("../core/database");

// Application waves. Only one wave can be open at a time.
class Waves {
	constructor(db) {
		this.db = db;
	}

	current() {
		return this.db.prepare("SELECT * FROM waves WHERE open = 1 ORDER BY id DESC LIMIT 1").get() ?? null;
	}

	latest() {
		return this.db.prepare("SELECT * FROM waves ORDER BY id DESC LIMIT 1").get() ?? null;
	}

	get(id) {
		return this.db.prepare("SELECT * FROM waves WHERE id = ?").get(id) ?? null;
	}

	open(name) {
		const current = this.current();
		if (current) {
			return { ok: false, reason: `**${current.name}** is still open. Close it first.` };
		}
		const result = this.db.prepare("INSERT INTO waves (name, open, opened_at) VALUES (?, 1, ?)").run(name, now());
		return { ok: true, wave: this.get(result.lastInsertRowid) };
	}

	close() {
		const current = this.current();
		if (!current) {
			return { ok: false, reason: "No wave is open." };
		}
		this.db.prepare("UPDATE waves SET open = 0, closed_at = ? WHERE id = ?").run(now(), current.id);
		return { ok: true, wave: this.get(current.id) };
	}

	stats(waveId) {
		const rows = this.db.prepare("SELECT status, COUNT(*) AS count FROM applications WHERE wave_id = ? GROUP BY status").all(waveId);
		const stats = { pending: 0, accepted: 0, denied: 0 };
		for (const row of rows) {
			stats[row.status] = row.count;
		}
		return stats;
	}
}

module.exports = { Waves };
