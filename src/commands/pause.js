const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses or resumes the current song'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        await buttonHandler.handlePause(interaction, player, player.requesterId);
    }
};
