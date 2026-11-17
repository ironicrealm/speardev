const { SlashCommandBuilder } = require("discord.js");
const config = require("../config");
const activityUi = require("../discord/activityUi");
const { EPHEMERAL, isStaff, log } = require("../discord/helpers");

// /loa request | end | list
module.exports = {
	data: new SlashCommandBuilder()
		.setName("loa")
		.setDescription("Leave of absence")
		.addSubcommand((sub) =>
			sub
				.setName("request")
				.setDescription("Ask staff for a leave of absence")
				.addIntegerOption((option) =>
					option.setName("days").setDescription("How many days").setRequired(true).setMinValue(1).setMaxValue(config.Activity.LoaMaxDays)
				)
				.addStringOption((option) => option.setName("reason").setDescription("Why").setRequired(true).setMaxLength(500))
		)
		.addSubcommand((sub) => sub.setName("end").setDescription("End your leave early"))
		.addSubcommand((sub) => sub.setName("list").setDescription("Staff: who is on leave")),

	async run(interaction, ctx) {
		const sub = interaction.options.getSubcommand();
		const me = interaction.user.id;

		if (sub === "request") {
			if (ctx.loas.activeFor(me)) {
				await interaction.reply({ content: "You're already on leave. Use `/loa end` first if you want to change it.", flags: EPHEMERAL });
				return;
			}
			if (ctx.loas.pendingFor(me)) {
				await interaction.reply({ content: "You already have a request waiting for staff.", flags: EPHEMERAL });
				return;
			}
			await interaction.deferReply({ flags: EPHEMERAL });
			const link = ctx.links.get(me);
			const loa = ctx.loas.request({
				discordId: me,
				robloxId: link?.roblox_id ?? null,
				days: interaction.options.getInteger("days"),
				reason: interaction.options.getString("reason").trim(),
			});
			const review = await ctx.client.channels.fetch(config.Channels.Review);
			const message = await review.send(activityUi.loaCard(loa, link?.roblox_name));
			ctx.loas.setReviewMessage(loa.id, message.id);
			await interaction.editReply({ content: `Leave request sent for ${loa.days} day${loa.days === 1 ? "" : "s"}. You'll get a DM when staff decide.` });
			return;
		}

		if (sub === "end") {
			const loa = ctx.loas.end(me);
			if (!loa) {
				await interaction.reply({ content: "You're not on leave.", flags: EPHEMERAL });
				return;
			}
			await log(ctx.client, `🏖️ <@${me}> ended their leave early`);
			await interaction.reply({ content: "Welcome back! Your leave has ended.", flags: EPHEMERAL });
			return;
		}

		if (!isStaff(interaction.member)) {
			await interaction.reply({ content: "Staff only.", flags: EPHEMERAL });
			return;
		}
		const active = ctx.loas.allActive();
		await interaction.reply({
			content: active.length
				? active.map((loa) => `<@${loa.discord_id}> until <t:${loa.ends_at}:f> · ${loa.reason ?? ""}`.slice(0, 180)).join("\n").slice(0, 1900)
				: "Nobody is on leave.",
			flags: EPHEMERAL,
			allowedMentions: { parse: [] },
		});
	},
};
