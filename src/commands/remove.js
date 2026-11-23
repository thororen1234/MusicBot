const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Removes a song from the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Position in the queue')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        const position = interaction.options.getInteger('position');
        const removed = player.removeFromQueue(position - 1);
        if (!removed) {
            return await interaction.reply({ content: `❌ The queue has ${player.queue.length} songs.`, flags: [1 << 6] });
        }

        await interaction.reply({ content: `🗑️ Removed **${removed.title}**.`, flags: [1 << 6] });
        if (client.musicEmbedManager && player.currentTrack) {
            await client.musicEmbedManager.updateNowPlayingEmbed(player);
        }
    }
};
