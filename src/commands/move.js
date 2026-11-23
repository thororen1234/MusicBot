const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Moves a song to another position in the queue')
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription('Current position')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('to')
                .setDescription('New position')
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

        const from = interaction.options.getInteger('from');
        const to = interaction.options.getInteger('to');
        const track = player.queue[from - 1];
        if (!player.moveInQueue(from - 1, to - 1)) {
            return await interaction.reply({ content: `❌ The queue has ${player.queue.length} songs.`, flags: [1 << 6] });
        }

        await interaction.reply({ content: `↕️ Moved **${track.title}** to position ${to}.`, flags: [1 << 6] });
        if (client.musicEmbedManager && player.currentTrack) {
            await client.musicEmbedManager.updateNowPlayingEmbed(player);
        }
    }
};
