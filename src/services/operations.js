const { now } = require("../core/database");

// Events ("operations") and the KIA list for each one.
// An operation belongs to one game server (job id) and runs until staff end it or the server closes.
class Operations {
	constructor(db) {
		this.db = db;
	}

	get(id) {
		return this.db.prepare("SELECT * FROM operations WHERE id = ?").get(id) ?? null;
	}

	active(jobId) {
		return this.db.prepare("SELECT * FROM operations WHERE job_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1").get(jobId) ?? null;
	}

	start({ jobId, placeId, map, header, message, handler, players, maxPlayers }) {
		const previous = this.active(jobId);
		if (previous) {
			this.end(jobId);
		}
		const result = this.db
			.prepare(
				`INSERT INTO operations (job_id, place_id, map, header, message, handler, deployed, max_players, started_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(jobId, placeId, map, header ?? null, message ?? null, handler ?? null, players ?? 0, maxPlayers ?? null, now());
		return { operation: this.get(result.lastInsertRowid), previous };
	}

	// Deployed = the most players seen in the server during the operation
	notePlayers(operationId, players) {
		if (typeof players === "number") {
			this.db.prepare("UPDATE operations SET deployed = MAX(deployed, ?) WHERE id = ?").run(players, operationId);
		}
	}

	end(jobId) {
		const operation = this.active(jobId);
		if (!operation) {
			return null;
		}
		this.db.prepare("UPDATE operations SET ended_at = ? WHERE id = ?").run(now(), operation.id);
		return this.get(operation.id);
	}

	setMessage(id, column, messageId) {
		const allowed = { log: "log_message_id", alert: "alert_message_id" };
		this.db.prepare(`UPDATE operations SET ${allowed[column]} = ? WHERE id = ?`).run(messageId, id);
	}

	addKia({ operationId, robloxId, robloxName, slot, cause, map }) {
		const result = this.db
			.prepare("INSERT INTO kia (operation_id, roblox_id, roblox_name, slot, cause, map, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
			.run(operationId ?? null, robloxId, robloxName, slot ?? null, cause ?? null, map ?? null, now());
		return this.getKia(result.lastInsertRowid);
	}

	getKia(id) {
		return this.db.prepare("SELECT * FROM kia WHERE id = ?").get(id) ?? null;
	}

	kiaFor(operationId) {
		return this.db.prepare("SELECT * FROM kia WHERE operation_id = ? ORDER BY id").all(operationId);
	}

	setKiaMessage(id, messageId) {
		this.db.prepare("UPDATE kia SET message_id = ? WHERE id = ?").run(messageId, id);
	}

	// Undo the latest death of this player (from the last day). Returns the KIA entry or null.
	restore(robloxId) {
		const kia = this.db
			.prepare("SELECT * FROM kia WHERE roblox_id = ? AND restored = 0 AND at > ? ORDER BY id DESC LIMIT 1")
			.get(robloxId, now() - 86400);
		if (!kia) {
			return null;
		}
		this.db.prepare("UPDATE kia SET restored = 1 WHERE id = ?").run(kia.id);
		return this.getKia(kia.id);
	}

	latestKia(robloxId, maxAgeSeconds) {
		return (
			this.db
				.prepare("SELECT * FROM kia WHERE roblox_id = ? AND restored = 0 AND at > ? ORDER BY id DESC LIMIT 1")
				.get(robloxId, now() - maxAgeSeconds) ?? null
		);
	}

	setMemorial(kiaId, messageId) {
		this.db.prepare("UPDATE kia SET memorial_message_id = ? WHERE id = ?").run(messageId, kiaId);
	}

	// Who took part in which event
	attend(operationId, robloxIds) {
		const insert = this.db.prepare("INSERT OR IGNORE INTO attendance (operation_id, roblox_id) VALUES (?, ?)");
		for (const id of robloxIds) {
			if (Number.isInteger(id)) {
				insert.run(operationId, id);
			}
		}
	}

	eventsAttended(robloxId) {
		return this.db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE roblox_id = ?").get(robloxId).n;
	}

	deathStats(robloxId) {
		const row = this.db
			.prepare("SELECT SUM(restored = 0) AS lost, SUM(restored = 1) AS voided FROM kia WHERE roblox_id = ?")
			.get(robloxId);
		return { lost: row.lost ?? 0, voided: row.voided ?? 0 };
	}

	seen(robloxId) {
		this.db
			.prepare("INSERT INTO activity (roblox_id, last_seen) VALUES (?, ?) ON CONFLICT(roblox_id) DO UPDATE SET last_seen = excluded.last_seen")
			.run(robloxId, now());
	}

	lastSeen(robloxId) {
		return this.db.prepare("SELECT last_seen FROM activity WHERE roblox_id = ?").get(robloxId)?.last_seen ?? null;
	}
}

module.exports = { Operations };
