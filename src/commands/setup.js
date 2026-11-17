const { SlashCommandBuilder } = require("discord.js");
const panel = require("../discord/panel");
const ticketUi = require("../discord/ticketUi");
const { EPHEMERAL } = require("../discord/helpers");

// /setup posts a panel in this channel: applications (Verify / Apply) or tickets
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("setup")
		.setDescription("Post a panel in this channel")
		.addStringOption((option) =>
			option
				.setName("panel")
				.setDescription("Which panel")
				.addChoices({ name: "Applications (Verify / Apply)", value: "applications" }, { name: "Tickets", value: "tickets" })
		),

	async run(interaction, ctx) {
		const which = interaction.options.getString("panel") ?? "applications";
		if (which === "tickets") {
			await interaction.channel.send(ticketUi.ticketPanel());
			await interaction.reply({ content: "Ticket panel posted.", flags: EPHEMERAL });
			return;
		}
		await panel.post(ctx, interaction.channel);
		await interaction.reply({ content: "Panel posted. It updates itself when waves open or close.", flags: EPHEMERAL });
	},
};
