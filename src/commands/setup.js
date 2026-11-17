const { SlashCommandBuilder } = require("discord.js");
const panel = require("../discord/panel");
const { EPHEMERAL } = require("../discord/helpers");

// /setup posts the Verify / Apply panel in this channel
module.exports = {
	staff: true,
	data: new SlashCommandBuilder().setName("setup").setDescription("Post the Verify / Apply panel in this channel"),

	async run(interaction, ctx) {
		await panel.post(ctx, interaction.channel);
		await interaction.reply({ content: "Panel posted. It updates itself when waves open or close.", flags: EPHEMERAL });
	},
};
