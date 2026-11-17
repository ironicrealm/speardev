// All bot settings. Secrets and IDs come from .env, everything else lives here.
module.exports = {
	Token: process.env.DISCORD_TOKEN,
	GuildId: process.env.GUILD_ID,
	RobloxApiKey: process.env.ROBLOX_API_KEY,

	Channels: {
		Apply: process.env.APPLY_CHANNEL_ID,
		Review: process.env.REVIEW_CHANNEL_ID,
		Log: process.env.LOG_CHANNEL_ID || null,
		Alerts: "1572121736072269824",
		PdLogs: "1572121860190109787",
		Tickets: "1572131367553077258",
		Memorial: "1572133332899074109",
	},

	// Ticket channels are made in this category
	TicketCategory: "1572132076508028958",
	// Tickets nobody claimed or decided are closed after this many days
	TicketAutoCloseDays: 3,

	TicketTypes: {
		appeal: {
			Label: "Death Appeal",
			Prefix: "appeal",
			Questions: [
				{ Id: "unfair", Label: "Why was your death unfair?", Style: "Paragraph", Max: 1500 },
				{ Id: "proof", Label: "Proof (links to clips or screenshots)", Style: "Paragraph", Max: 1000, Optional: true },
			],
		},
		support: {
			Label: "General Support",
			Prefix: "support",
			Questions: [{ Id: "topic", Label: "What do you need help with?", Style: "Paragraph", Max: 1500 }],
		},
		event: {
			Label: "Event Request",
			Prefix: "event",
			Questions: [
				{ Id: "type", Label: "Event type", Style: "Short", Max: 100 },
				{ Id: "info", Label: "Information", Style: "Paragraph", Max: 1500 },
				{ Id: "reason", Label: "Reasoning", Style: "Paragraph", Max: 1000 },
			],
		},
		ban: {
			Label: "Ban Appeal",
			Prefix: "ban",
			Questions: [
				{ Id: "what", Label: "What were you banned for?", Style: "Paragraph", Max: 1000 },
				{ Id: "why", Label: "Why should the ban be lifted?", Style: "Paragraph", Max: 1500 },
			],
		},
	},

	// Activity
	Activity: {
		// DM a warning after this many days without playing
		WarnDays: 5,
		// Move to Inactive after this many days without playing
		RemoveDays: 7,
		// Longest leave of absence someone can ask for
		LoaMaxDays: 60,
	},

	// Soft ban: this role can only see the tickets channel
	BannedRoleId: "1572138420770308116",

	// The game talks to the bot through this. GAME_SECRET must match the secret saved in Roblox.
	Game: {
		Port: Number(process.env.GAME_PORT) || 3005,
		Secret: process.env.GAME_SECRET,
	},

	// Deployment alerts ping this Discord role (by name). null = no ping.
	AlertPingRole: "Waved",

	// Permadeath timeout in every Discord server the bot is in (seconds)
	DeathTimeout: 120,

	// Discord roles (by name) that can review applications and run staff commands
	StaffRoles: ["Moderator", "Admin", "Developer"],

	// Discord roles (by name) given out by the bot. Leave null to skip.
	VerifiedRole: "Verified",
	WavedRole: "Waved",

	Group: {
		Id: 99718853,
		// Rank accepted players should end up on ("Waved")
		WavedRank: 1,
		// Rank for players removed for inactivity. It sits above Waved, so it's checked by number.
		InactiveRank: 2,
		Link: "https://www.roblox.com/communities/99718853",
	},

	Database: "data/speardev.db",

	// How often to check for join requests from accepted players (seconds)
	GroupSyncInterval: 60,

	// How long a verification code stays valid (minutes)
	VerifyCodeMinutes: 30,

	// Application form. Roblox username and profile link are filled in from the linked account.
	Questions: [
		{ Id: "experience", Label: "Experience in past CC games", Style: "Paragraph", Max: 1000 },
		{ Id: "found", Label: "How'd you find out about Spearhead?", Style: "Short", Max: 200 },
		{ Id: "why", Label: "Why do you want to join Spearhead?", Style: "Paragraph", Max: 1000 },
	],

	Colors: {
		Main: 0x3a608c,
		Accepted: 0x3fa45b,
		Denied: 0xb4413c,
		Pending: 0xc9a227,
		Kia: 0xde4040,
		Alert: 0x8cd7ff,
		Concluded: 0x6e7a8c,
		Appeal: 0xde4040,
		Support: 0x3a608c,
		Event: 0xc9a227,
		Memorial: 0x2b2f36,
		Ban: 0x8a2b2b,
		Loa: 0x5b7fa6,
		RollCall: 0x8cd7ff,
	},
};
