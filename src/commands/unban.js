const { SlashCommandBuilder } = require("discord.js");
const bans = require("../discord/bans");
const { EPHEMERAL } = require("../discord/helpers");

// /unban @member lifts a soft ban
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("unban")
		.setDescription("Lift a soft ban")
		.addUserOption((option) => option.setName("member").setDescription("Who").setRequired(true)),

	async run(interaction, ctx) {
		const user = interaction.options.getUser("member");
		await interaction.deferReply({ flags: EPHEMERAL });
		const result = await bans.unban(ctx, interaction.guild, user.id, interaction.user.id);
		await interaction.editReply({ content: result.message, allowedMentions: { parse: [] } });
	},
};
