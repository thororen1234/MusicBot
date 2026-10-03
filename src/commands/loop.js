const { SlashCommandBuilder } = require('discord.js');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Sets the loop mode (cycles Off → Track → Queue when no mode is given)')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode to set')
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' }
                )),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        await buttonHandler.handleLoop(interaction, player, player.requesterId, interaction.options.getString('mode'));
    }
};
