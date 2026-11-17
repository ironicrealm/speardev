// All bot settings. Secrets and IDs come from .env, everything else lives here.
module.exports = {
	Token: process.env.DISCORD_TOKEN,
	GuildId: process.env.GUILD_ID,
	RobloxApiKey: process.env.ROBLOX_API_KEY,

	Channels: {
		Apply: process.env.APPLY_CHANNEL_ID,
		Review: process.env.REVIEW_CHANNEL_ID,
		Log: process.env.LOG_CHANNEL_ID || null,
	},

	// Discord roles (by name) that can review applications and run staff commands
	StaffRoles: ["Moderator", "Admin", "Developer"],

	// Discord roles (by name) given out by the bot. Leave null to skip.
	VerifiedRole: "Verified",
	WavedRole: "Waved",

	Group: {
		Id: 99718853,
		// Rank accepted players should end up on ("Waved")
		WavedRank: 1,
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
	},
};
