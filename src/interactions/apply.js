const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config");
const ui = require("../discord/ui");
const { EPHEMERAL } = require("../discord/helpers");

// Apply button -> application form -> posted to the staff review channel

function blocked(ctx, discordId) {
	const wave = ctx.waves.current();
	if (!wave) {
		return { reason: "Applications are closed right now. Keep an eye out for the next wave!" };
	}
	const link = ctx.links.get(discordId);
	if (!link) {
		return {
			reason: "Link your Roblox account first.",
			components: [
				new ActionRowBuilder().addComponents(
					new ButtonBuilder().setCustomId("verify:start").setLabel("Verify").setStyle(ButtonStyle.Secondary)
				),
			],
		};
	}
	const allowed = ctx.applications.canApply(discordId, link.roblox_id, wave.id);
	if (!allowed.ok) {
		return { reason: allowed.reason };
	}
	return null;
}

async function start(interaction, ctx) {
	const problem = blocked(ctx, interaction.user.id);
	if (problem) {
		await interaction.reply({ content: problem.reason, components: problem.components ?? [], flags: EPHEMERAL });
		return;
	}
	await interaction.showModal(ui.applyModal(ctx.waves.current().name));
}

async function submit(interaction, ctx) {
	await interaction.deferReply({ flags: EPHEMERAL });
	// checked again in case the wave closed while they were typing
	const problem = blocked(ctx, interaction.user.id);
	if (problem) {
		await interaction.editReply({ content: problem.reason });
		return;
	}
	const wave = ctx.waves.current();
	const link = ctx.links.get(interaction.user.id);
	const user = await ctx.roblox.getUser(link.roblox_id).catch(() => null);

	const answers = {};
	for (const question of config.Questions) {
		answers[question.Id] = interaction.fields.getTextInputValue(question.Id);
	}
	const app = ctx.applications.create({
		waveId: wave.id,
		discordId: interaction.user.id,
		robloxId: link.roblox_id,
		robloxName: user?.name ?? link.roblox_name,
		robloxCreated: user?.created ? Math.floor(new Date(user.created).getTime() / 1000) : null,
		answers,
	});

	const channel = await ctx.client.channels.fetch(config.Channels.Review);
	const message = await channel.send(ui.reviewMessage(app, wave));
	ctx.applications.setReviewMessage(app.id, message.id);

	await interaction.editReply({ content: `Application sent for **${wave.name}**! You'll get a DM when staff have looked at it.` });
}

module.exports = {
	"apply:start": start,
	"apply:submit": submit,
};
