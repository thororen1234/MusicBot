const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Plays the previous song again'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        await buttonHandler.handlePrevious(interaction, player, player.requesterId);
    }
};
