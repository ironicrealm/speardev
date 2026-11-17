const { SlashCommandBuilder } = require("discord.js");
const { EPHEMERAL } = require("../discord/helpers");

// /unlink @member removes their Roblox link so they can verify again
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("unlink")
		.setDescription("Remove a member's Roblox link")
		.addUserOption((option) => option.setName("member").setDescription("Discord member").setRequired(true)),

	async run(interaction, ctx) {
		const member = interaction.options.getUser("member");
		const removed = ctx.links.unlink(member.id);
		await interaction.reply({
			content: removed ? `Unlinked <@${member.id}>.` : `<@${member.id}> wasn't linked.`,
			flags: EPHEMERAL,
			allowedMentions: { parse: [] },
		});
	},
};
