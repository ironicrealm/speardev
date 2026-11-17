const { SlashCommandBuilder } = require("discord.js");
const ticketUi = require("../discord/ticketUi");
const { EPHEMERAL } = require("../discord/helpers");

// /dossier [member] shows someone's service record
module.exports = {
	data: new SlashCommandBuilder()
		.setName("dossier")
		.setDescription("Show a Processor's service record")
		.addUserOption((option) => option.setName("member").setDescription("Whose dossier (leave empty for your own)")),

	async run(interaction, ctx) {
		const user = interaction.options.getUser("member") ?? interaction.user;
		const link = ctx.links.get(user.id);
		if (!link) {
			const who = user.id === interaction.user.id ? "You haven't" : `<@${user.id}> hasn't`;
			await interaction.reply({ content: `${who} linked a Roblox account yet.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
			return;
		}
		await interaction.deferReply();
		const accepted = ctx.db
			.prepare("SELECT a.decided_at, w.name FROM applications a LEFT JOIN waves w ON w.id = a.wave_id WHERE a.discord_id = ? AND a.status = 'accepted' ORDER BY a.id DESC LIMIT 1")
			.get(user.id);
		await interaction.editReply(
			ticketUi.dossier({
				link,
				accepted: accepted?.decided_at ?? null,
				wave: accepted?.name ?? null,
				avatar: await ctx.roblox.getHeadshot(link.roblox_id),
				events: ctx.operations.eventsAttended(link.roblox_id),
				lastSeen: ctx.operations.lastSeen(link.roblox_id),
				deaths: ctx.operations.deathStats(link.roblox_id),
			})
		);
	},
};
