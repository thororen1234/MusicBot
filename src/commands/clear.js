const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Removes every song from the queue, keeping the current one'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        const cleared = player.clearQueue();
        await interaction.reply({ content: `🧹 Removed ${cleared} songs from the queue.`, flags: [1 << 6] });
        if (client.musicEmbedManager && player.currentTrack) {
            await client.musicEmbedManager.updateNowPlayingEmbed(player);
        }
    }
};
