const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const modalHandler = require('../events/modalHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

const GENRES = [
    { name: 'Pop', value: 'pop' },
    { name: 'Rock', value: 'rock' },
    { name: 'Hip-Hop', value: 'hiphop' },
    { name: 'Electronic', value: 'electronic' },
    { name: 'Jazz', value: 'jazz' },
    { name: 'Classical', value: 'classical' },
    { name: 'Metal', value: 'metal' },
    { name: 'Country', value: 'country' },
    { name: 'R&B', value: 'rnb' },
    { name: 'Indie', value: 'indie' },
    { name: 'Latin', value: 'latin' },
    { name: 'K-Pop', value: 'kpop' },
    { name: 'Anime', value: 'anime' },
    { name: 'Lo-Fi', value: 'lofi' },
    { name: 'Random', value: 'random' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggles genre-based autoplay (shows a genre picker when no genre is given)')
        .addStringOption(option =>
            option.setName('genre')
                .setDescription('Genre to autoplay, or Off to disable')
                .addChoices({ name: 'Off', value: 'off' }, ...GENRES)),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        const genre = interaction.options.getString('genre');
        if (!genre) {
            return await buttonHandler.handleAutoplay(interaction, player, player.requesterId);
        }

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        if (genre === 'off') {
            return await buttonHandler.disableAutoplay(interaction, player);
        }

        await modalHandler.enableAutoplay(interaction, player, genre);
    }
};
