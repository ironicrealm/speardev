const { SlashCommandBuilder } = require("discord.js");
const ui = require("../discord/ui");
const { EPHEMERAL } = require("../discord/helpers");

// /whois @member  or  /whois roblox:<username>
module.exports = {
	staff: true,
	data: new SlashCommandBuilder()
		.setName("whois")
		.setDescription("See who a member or Roblox account is linked to")
		.addUserOption((option) => option.setName("member").setDescription("Discord member"))
		.addStringOption((option) => option.setName("roblox").setDescription("Roblox username")),

	async run(interaction, ctx) {
		const member = interaction.options.getUser("member");
		const robloxName = interaction.options.getString("roblox");
		let link = null;

		if (member) {
			link = ctx.links.get(member.id);
		} else if (robloxName) {
			const user = await ctx.roblox.findUserByName(robloxName).catch(() => null);
			link = user ? ctx.links.getByRoblox(user.id) : null;
		} else {
			await interaction.reply({ content: "Give a member or a Roblox username.", flags: EPHEMERAL });
			return;
		}

		if (!link) {
			await interaction.reply({ content: "Not linked.", flags: EPHEMERAL });
			return;
		}
		const app = ctx.applications.latestFor(link.discord_id);
		const status = app ? `Latest application: #${app.id}, **${app.status}**${app.status === "accepted" ? ` (group: ${app.group_status})` : ""}` : "No applications yet.";
		await interaction.reply({
			content: [
				`<@${link.discord_id}> ↔ [${link.roblox_name}](${ui.profileLink(link.roblox_id)}) (ID ${link.roblox_id})`,
				`Linked <t:${link.linked_at}:R>`,
				status,
			].join("\n"),
			flags: EPHEMERAL,
			allowedMentions: { parse: [] },
		});
	},
};
