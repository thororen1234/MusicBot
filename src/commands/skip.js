const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips to the next song in the queue'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        await buttonHandler.handleSkip(interaction, player, player.requesterId);
    }
};
