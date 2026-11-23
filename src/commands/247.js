const { SlashCommandBuilder } = require('discord.js');
const PlayerStateManager = require('../managers/PlayerStateManager');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription('Toggles keeping the bot connected to voice when the queue is empty'),

    async execute(interaction) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        player.stayConnected247 = !player.stayConnected247;
        clearTimeout(player.queueEndTimer);
        player.queueEndTimer = null;

        if (player.stayConnected247) {
            await PlayerStateManager.saveState(interaction.guild.id, player.serializeState());
            return interaction.reply({ content: '✅ 24/7 mode enabled. I will stay connected when the queue is empty.' });
        }

        await interaction.reply({ content: '✅ 24/7 mode disabled.' });

        if (!player.currentTrack && player.queue.length === 0) {
            await PlayerStateManager.removeState(interaction.guild.id);
            player.cleanup();
            interaction.client.players.delete(interaction.guild.id);
        } else {
            await PlayerStateManager.saveState(interaction.guild.id, player.serializeState());
        }
    }
};
