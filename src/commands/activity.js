const { SlashCommandBuilder } = require("discord.js");
const activityUi = require("../discord/activityUi");
const inactivity = require("../discord/inactivity");
const { EPHEMERAL, log } = require("../discord/helpers");

// /activity start | end | status (roll calls)
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("activity")
		.setDescription("Activity checks (roll calls)")
		.addSubcommand((sub) =>
			sub
				.setName("start")
				.setDescription("Post a roll call in this channel")
				.addIntegerOption((option) => option.setName("hours").setDescription("How long people have to report in").setRequired(true).setMinValue(1).setMaxValue(336))
				.addStringOption((option) => option.setName("note").setDescription("Extra message on the card").setMaxLength(500))
		)
		.addSubcommand((sub) => sub.setName("end").setDescription("Close the roll call now and review who didn't report"))
		.addSubcommand((sub) => sub.setName("status").setDescription("How many have reported in")),

	async run(interaction, ctx) {
		const sub = interaction.options.getSubcommand();
		const open = ctx.activity.openCheck();

		if (sub === "start") {
			if (open) {
				await interaction.reply({ content: `Activity check ${open.id} is still running. End it first.`, flags: EPHEMERAL });
				return;
			}
			await interaction.deferReply({ flags: EPHEMERAL });
			const check = ctx.activity.startCheck({
				channelId: interaction.channel.id,
				createdBy: interaction.user.id,
				hours: interaction.options.getInteger("hours"),
				note: interaction.options.getString("note"),
			});
			const message = await interaction.channel.send(activityUi.rollCall(check, 0, await inactivity.pingRoleId(interaction.guild)));
			ctx.activity.setCheckMessage(check.id, "message", message.id);
			await log(ctx.client, `📋 <@${interaction.user.id}> started activity check ${check.id}`);
			await interaction.editReply({ content: `Activity check ${check.id} posted. It closes <t:${check.ends_at}:R>.` });
			return;
		}

		if (!open) {
			await interaction.reply({ content: "No activity check is running.", flags: EPHEMERAL });
			return;
		}
		if (sub === "end") {
			await interaction.deferReply({ flags: EPHEMERAL });
			const check = await inactivity.closeCheck(ctx, open.id);
			await interaction.editReply({
				content: check ? `Closed. ${check.missing.length} didn't report in, review is in the staff channel.` : "It was already closed.",
			});
			return;
		}
		await interaction.reply({
			content: `Activity check ${open.id}: ${ctx.activity.responses(open.id).length} reported in, closes <t:${open.ends_at}:R>.`,
			flags: EPHEMERAL,
		});
	},
};
