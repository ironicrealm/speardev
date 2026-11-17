const { SlashCommandBuilder } = require("discord.js");
const ui = require("../discord/ui");

// /verify does the same as the Verify button
module.exports = {
	data: new SlashCommandBuilder().setName("verify").setDescription("Link your Roblox account"),

	async run(interaction) {
		await interaction.showModal(ui.verifyModal());
	},
};
