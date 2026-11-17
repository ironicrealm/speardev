const { EmbedBuilder } = require("discord.js");
const config = require("../config");
const ui = require("../discord/ui");
const { EPHEMERAL, giveRole } = require("../discord/helpers");

// Verify button -> username form -> code -> Check button

async function start(interaction) {
	await interaction.showModal(ui.verifyModal());
}

async function username(interaction, ctx) {
	await interaction.deferReply({ flags: EPHEMERAL });
	const result = await ctx.links.start(interaction.user.id, interaction.fields.getTextInputValue("username"));
	if (!result.ok) {
		await interaction.editReply({ content: result.reason });
		return;
	}
	await interaction.editReply(ui.verifyInstructions(result.user, result.code));
}

async function check(interaction, ctx) {
	await interaction.deferUpdate();
	const result = await ctx.links.check(interaction.user.id);
	if (!result.ok) {
		await interaction.followUp({ content: result.reason, flags: EPHEMERAL });
		return;
	}
	await giveRole(interaction.guild, interaction.user.id, config.VerifiedRole);
	const embed = new EmbedBuilder()
		.setColor(config.Colors.Accepted)
		.setTitle("Verified")
		.setDescription(
			`Linked to **[${result.link.roblox_name}](${ui.profileLink(result.link.roblox_id)})**. You can remove the code from your About now.`
		);
	await interaction.editReply({ embeds: [embed], components: [] });
}

module.exports = {
	"verify:start": start,
	"verify:username": username,
	"verify:check": check,
};
