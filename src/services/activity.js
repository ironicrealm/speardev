const { now } = require("../core/database");

// Activity checks (roll calls) and the 7-day inactivity rule.
class Activity {
	constructor(db, { warnDays, removeDays }) {
		this.db = db;
		this.warnDays = warnDays;
		this.removeDays = removeDays;
	}

	// ---- roll calls ----

	getCheck(id) {
		const row = this.db.prepare("SELECT * FROM activity_checks WHERE id = ?").get(id);
		return row ? { ...row, missing: row.missing ? JSON.parse(row.missing) : null } : null;
	}

	openCheck() {
		const row = this.db.prepare("SELECT id FROM activity_checks WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
		return row ? this.getCheck(row.id) : null;
	}

	startCheck({ channelId, createdBy, hours, note }) {
		const start = now();
		const result = this.db
			.prepare("INSERT INTO activity_checks (channel_id, created_by, note, created_at, ends_at) VALUES (?, ?, ?, ?, ?)")
			.run(channelId, createdBy, note ?? null, start, start + Math.round(hours * 3600));
		return this.getCheck(result.lastInsertRowid);
	}

	setCheckMessage(id, column, messageId) {
		const allowed = { message: "message_id", review: "review_message_id" };
		this.db.prepare(`UPDATE activity_checks SET ${allowed[column]} = ? WHERE id = ?`).run(messageId, id);
	}

	// Returns true the first time someone reports in
	respond(checkId, discordId) {
		return this.db.prepare("INSERT OR IGNORE INTO activity_responses (check_id, discord_id, at) VALUES (?, ?, ?)").run(checkId, discordId, now()).changes > 0;
	}

	responses(checkId) {
		return this.db.prepare("SELECT discord_id FROM activity_responses WHERE check_id = ?").all(checkId).map((r) => r.discord_id);
	}

	// Checks whose time is up but haven't been closed yet
	dueChecks() {
		return this.db.prepare("SELECT id FROM activity_checks WHERE status = 'open' AND ends_at <= ?").all(now()).map((r) => this.getCheck(r.id));
	}

	// open -> review (waiting for staff to confirm) -> done / cancelled
	closeCheck(id, missing) {
		const result = this.db
			.prepare("UPDATE activity_checks SET status = 'review', missing = ?, ends_at = MIN(ends_at, ?) WHERE id = ? AND status = 'open'")
			.run(JSON.stringify(missing), now(), id);
		return result.changes > 0 ? this.getCheck(id) : null;
	}

	finishCheck(id, status) {
		const result = this.db.prepare("UPDATE activity_checks SET status = ? WHERE id = ? AND status = 'review'").run(status, id);
		return result.changes > 0 ? this.getCheck(id) : null;
	}

	// ---- 7-day rule ----

	// Off by default, so nobody is removed before the game is out
	isEnabled() {
		return this.db.prepare("SELECT value FROM settings WHERE key = 'inactivity'").get()?.value === "on";
	}

	setEnabled(on) {
		this.db
			.prepare("INSERT INTO settings (key, value) VALUES ('inactivity', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
			.run(on ? "on" : "off");
	}

	// Accepted players who are currently in the group as Waved
	members() {
		return this.db
			.prepare(
				`SELECT l.discord_id, l.roblox_id, l.roblox_name, MAX(a.decided_at) AS accepted_at, MAX(a.id) AS application_id
				FROM links l JOIN applications a ON a.discord_id = l.discord_id
				WHERE a.status = 'accepted' AND a.group_status = 'joined'
				GROUP BY l.discord_id`
			)
			.all();
	}

	// Sorts members into "warn" and "remove". lastSeen / lastLoa / onLoa / skip are lookups passed in.
	review({ lastSeen, lastLoa, onLoa, skip = () => false }) {
		const warn = [];
		const remove = [];
		const time = now();
		for (const member of this.members()) {
			if (onLoa(member.discord_id) || skip(member.discord_id)) {
				continue;
			}
			const baseline = Math.max(member.accepted_at ?? 0, lastSeen(member.roblox_id) ?? 0, lastLoa(member.discord_id) ?? 0);
			const days = (time - baseline) / 86400;
			const entry = { ...member, baseline, days };
			if (days >= this.removeDays) {
				remove.push(entry);
			} else if (days >= this.warnDays && this.warnedAt(member.roblox_id) !== baseline) {
				warn.push(entry);
			}
		}
		return { warn, remove };
	}

	warnedAt(robloxId) {
		return this.db.prepare("SELECT baseline FROM inactivity_warnings WHERE roblox_id = ?").get(robloxId)?.baseline ?? null;
	}

	markWarned(robloxId, baseline) {
		this.db
			.prepare("INSERT INTO inactivity_warnings (roblox_id, baseline) VALUES (?, ?) ON CONFLICT(roblox_id) DO UPDATE SET baseline = excluded.baseline")
			.run(robloxId, baseline);
	}

	// They're out: their acceptance no longer counts, so they can apply again
	markInactive(discordId) {
		this.db.prepare("UPDATE applications SET group_status = 'inactive' WHERE discord_id = ? AND status = 'accepted'").run(discordId);
	}
}

module.exports = { Activity };
