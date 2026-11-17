const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");
const inactivity = require("../discord/inactivity");
const { EPHEMERAL, log } = require("../discord/helpers");

// /inactivity status | enable | disable | preview (the automatic 7-day rule)
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("inactivity")
		.setDescription(`The automatic ${config.Activity.RemoveDays}-day inactivity rule`)
		.addSubcommand((sub) => sub.setName("status").setDescription("Is it on?"))
		.addSubcommand((sub) => sub.setName("enable").setDescription("Turn it on (do this once the game is out)"))
		.addSubcommand((sub) => sub.setName("disable").setDescription("Turn it off"))
		.addSubcommand((sub) => sub.setName("preview").setDescription("Who would be warned or removed right now (does nothing)")),

	async run(interaction, ctx) {
		const sub = interaction.options.getSubcommand();
		const rule = `warn after ${config.Activity.WarnDays} days, Inactive after ${config.Activity.RemoveDays} days without playing`;

		if (sub === "enable" || sub === "disable") {
			ctx.activity.setEnabled(sub === "enable");
			await log(ctx.client, `🕒 <@${interaction.user.id}> turned the inactivity rule ${sub === "enable" ? "on" : "off"}`);
			await interaction.reply({ content: `Inactivity rule is now **${sub === "enable" ? "on" : "off"}** (${rule}).`, flags: EPHEMERAL });
			return;
		}
		if (sub === "status") {
			await interaction.reply({ content: `Inactivity rule is **${ctx.activity.isEnabled() ? "on" : "off"}** (${rule}).`, flags: EPHEMERAL });
			return;
		}

		await interaction.deferReply({ flags: EPHEMERAL });
		const { warn, remove } = await inactivity.runInactivity(ctx, { dryRun: true });
		const line = (e) => `<@${e.discord_id}> · ${e.roblox_name} · ${Math.floor(e.days)} days`;
		await interaction.editReply({
			content: [
				`**Would be moved to Inactive (${remove.length})**`,
				...remove.slice(0, 25).map(line),
				`**Would be warned (${warn.length})**`,
				...warn.slice(0, 25).map(line),
				ctx.activity.isEnabled() ? "" : "_The rule is off, so nothing will happen until you `/inactivity enable`._",
			]
				.join("\n")
				.slice(0, 1900),
			allowedMentions: { parse: [] },
		});
	},
};
