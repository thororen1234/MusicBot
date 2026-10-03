const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Shows the lyrics of the current song'),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction, { requireVoice: false });
        if (!player) return;

        await buttonHandler.handleLyrics(interaction, player);
    }
};
