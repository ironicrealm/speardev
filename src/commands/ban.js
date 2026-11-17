const { SlashCommandBuilder } = require("discord.js");
const bans = require("../discord/bans");
const { EPHEMERAL, isStaff } = require("../discord/helpers");

// /ban @member [reason]: soft ban, they can only see tickets
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("ban")
		.setDescription("Soft ban: they stay in the server but can only see tickets")
		.addUserOption((option) => option.setName("member").setDescription("Who").setRequired(true))
		.addStringOption((option) => option.setName("reason").setDescription("Sent to them").setMaxLength(500)),

	async run(interaction, ctx) {
		const user = interaction.options.getUser("member");
		const reason = interaction.options.getString("reason")?.trim() || null;
		if (user.id === interaction.user.id) {
			await interaction.reply({ content: "You can't ban yourself.", flags: EPHEMERAL });
			return;
		}
		const target = await interaction.guild.members.fetch(user.id).catch(() => null);
		if (target && isStaff(target)) {
			await interaction.reply({ content: "You can't ban staff.", flags: EPHEMERAL });
			return;
		}
		await interaction.deferReply({ flags: EPHEMERAL });
		const result = await bans.ban(ctx, interaction.guild, user, reason, interaction.user.id);
		await interaction.editReply({ content: result.message, allowedMentions: { parse: [] } });
	},
};
