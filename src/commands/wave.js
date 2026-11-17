const { SlashCommandBuilder } = require("discord.js");
const panel = require("../discord/panel");
const { EPHEMERAL, log } = require("../discord/helpers");

// /wave open | close | status
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("wave")
		.setDescription("Open, close or check application waves")
		.addSubcommand((sub) =>
			sub
				.setName("open")
				.setDescription("Open a new wave")
				.addStringOption((option) => option.setName("name").setDescription('e.g. "Wave 3"').setRequired(true).setMaxLength(40))
		)
		.addSubcommand((sub) => sub.setName("close").setDescription("Close the current wave"))
		.addSubcommand((sub) => sub.setName("status").setDescription("Show the current wave and its numbers")),

	async run(interaction, ctx) {
		const sub = interaction.options.getSubcommand();

		if (sub === "open") {
			const result = ctx.waves.open(interaction.options.getString("name").trim());
			if (!result.ok) {
				await interaction.reply({ content: result.reason, flags: EPHEMERAL });
				return;
			}
			await panel.refresh(ctx);
			await log(ctx.client, `🟢 <@${interaction.user.id}> opened **${result.wave.name}**`);
			await interaction.reply({ content: `**${result.wave.name}** is open. The Apply button is live.`, flags: EPHEMERAL });
			return;
		}

		if (sub === "close") {
			const result = ctx.waves.close();
			if (!result.ok) {
				await interaction.reply({ content: result.reason, flags: EPHEMERAL });
				return;
			}
			const stats = ctx.waves.stats(result.wave.id);
			await panel.refresh(ctx);
			await log(ctx.client, `🔴 <@${interaction.user.id}> closed **${result.wave.name}**`);
			await interaction.reply({
				content: `**${result.wave.name}** closed. ${stats.pending} still waiting for review, ${stats.accepted} accepted, ${stats.denied} denied.`,
				flags: EPHEMERAL,
			});
			return;
		}

		const wave = ctx.waves.current() ?? ctx.waves.latest();
		if (!wave) {
			await interaction.reply({ content: "No waves yet. Start one with `/wave open`.", flags: EPHEMERAL });
			return;
		}
		const stats = ctx.waves.stats(wave.id);
		await interaction.reply({
			content: [
				`**${wave.name}** — ${wave.open ? "🟢 open" : "🔴 closed"}`,
				`Waiting: ${stats.pending} · Accepted: ${stats.accepted} · Denied: ${stats.denied}`,
			].join("\n"),
			flags: EPHEMERAL,
		});
	},
};
