const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the queue'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        await buttonHandler.handleShuffle(interaction, player, player.requesterId);
    }
};
