const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const modalHandler = require('../events/modalHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Sets the volume (opens the volume dialog when no level is given)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (0-100)')
                .setMinValue(0)
                .setMaxValue(100)),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        const level = interaction.options.getInteger('level');
        if (level === null) {
            return await buttonHandler.handleVolumeModal(interaction, player, player.requesterId);
        }

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        await modalHandler.applyVolume(interaction, player, level);
    }
};
