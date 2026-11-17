const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Opens the database file and makes sure the tables exist
function open(file) {
	if (file !== ":memory:") {
		fs.mkdirSync(path.dirname(file), { recursive: true });
	}
	const db = new DatabaseSync(file);
	db.exec(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS links (
			discord_id TEXT PRIMARY KEY,
			roblox_id INTEGER NOT NULL UNIQUE,
			roblox_name TEXT NOT NULL,
			linked_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS verifications (
			discord_id TEXT PRIMARY KEY,
			roblox_id INTEGER NOT NULL,
			roblox_name TEXT NOT NULL,
			code TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS waves (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			open INTEGER NOT NULL DEFAULT 1,
			opened_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS applications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			wave_id INTEGER NOT NULL,
			discord_id TEXT NOT NULL,
			roblox_id INTEGER NOT NULL,
			roblox_name TEXT NOT NULL,
			roblox_created INTEGER,
			answers TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			reviewer_id TEXT,
			reason TEXT,
			review_message_id TEXT,
			group_status TEXT NOT NULL DEFAULT 'none',
			created_at INTEGER NOT NULL,
			decided_at INTEGER
		);

		CREATE INDEX IF NOT EXISTS applications_discord ON applications (discord_id);
		CREATE INDEX IF NOT EXISTS applications_group ON applications (group_status);

		CREATE TABLE IF NOT EXISTS operations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			job_id TEXT NOT NULL,
			place_id INTEGER NOT NULL,
			map TEXT NOT NULL,
			header TEXT,
			message TEXT,
			handler TEXT,
			deployed INTEGER NOT NULL DEFAULT 0,
			max_players INTEGER,
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			log_message_id TEXT,
			alert_message_id TEXT
		);

		CREATE INDEX IF NOT EXISTS operations_job ON operations (job_id);

		CREATE TABLE IF NOT EXISTS kia (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			operation_id INTEGER,
			roblox_id INTEGER NOT NULL,
			roblox_name TEXT NOT NULL,
			slot TEXT,
			cause TEXT,
			map TEXT,
			at INTEGER NOT NULL,
			restored INTEGER NOT NULL DEFAULT 0,
			message_id TEXT
		);

		CREATE INDEX IF NOT EXISTS kia_roblox ON kia (roblox_id);

		CREATE TABLE IF NOT EXISTS activity (
			roblox_id INTEGER PRIMARY KEY,
			last_seen INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS tickets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			discord_id TEXT NOT NULL,
			roblox_id INTEGER,
			channel_id TEXT,
			message_id TEXT,
			answers TEXT NOT NULL,
			kia_id INTEGER,
			status TEXT NOT NULL DEFAULT 'open',
			claimed_by TEXT,
			closed_by TEXT,
			reason TEXT,
			created_at INTEGER NOT NULL,
			closed_at INTEGER
		);

		CREATE INDEX IF NOT EXISTS tickets_user ON tickets (discord_id, status);

		CREATE TABLE IF NOT EXISTS actions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			roblox_id INTEGER NOT NULL,
			kind TEXT NOT NULL,
			slot TEXT,
			since INTEGER,
			ticket_id INTEGER,
			created_at INTEGER NOT NULL,
			done_at INTEGER,
			result TEXT
		);

		CREATE INDEX IF NOT EXISTS actions_pending ON actions (roblox_id, done_at);

		CREATE TABLE IF NOT EXISTS bans (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			discord_id TEXT NOT NULL,
			reason TEXT,
			banned_by TEXT,
			created_at INTEGER NOT NULL,
			lifted_at INTEGER,
			lifted_by TEXT
		);

		CREATE INDEX IF NOT EXISTS bans_user ON bans (discord_id, lifted_at);

		CREATE TABLE IF NOT EXISTS attendance (
			operation_id INTEGER NOT NULL,
			roblox_id INTEGER NOT NULL,
			PRIMARY KEY (operation_id, roblox_id)
		);
	`);
	// columns added after the first release
	addColumn(db, "kia", "memorial_message_id TEXT");
	return db;
}

function addColumn(db, table, definition) {
	try {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
	} catch {
		// already there
	}
}

function now() {
	return Math.floor(Date.now() / 1000);
}

module.exports = { open, now };
