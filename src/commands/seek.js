const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Jumps to a position in the current song')
        .addStringOption(option =>
            option.setName('position')
                .setDescription('Time to jump to, e.g. 1:30 or 90')
                .setRequired(true)),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        const track = player.currentTrack;
        if (!track) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.no_song_playing'),
                flags: [1 << 6]
            });
        }

        const input = interaction.options.getString('position').trim();
        if (!/^(\d+:)?(\d+:)?\d+$/.test(input)) {
            return await interaction.reply({ content: '❌ Use a time like 1:30 or 90.', flags: [1 << 6] });
        }
        const seconds = input.split(':').reduce((total, part) => total * 60 + Number(part), 0);

        if (track.isLive || !track.duration) {
            return await interaction.reply({ content: '❌ This song can\'t be seeked.', flags: [1 << 6] });
        }
        if (seconds >= track.duration) {
            return await interaction.reply({ content: `❌ The song is only ${player.formatDuration(track.duration)} long.`, flags: [1 << 6] });
        }

        await interaction.deferReply({ flags: [1 << 6] });
        const seeked = await player.seek(seconds * 1000);
        await interaction.editReply({
            content: seeked ? `⏩ Jumped to ${player.formatDuration(seconds)}.` : '❌ Couldn\'t seek in this song.'
        });
    }
};
