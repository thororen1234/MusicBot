const { SlashCommandBuilder } = require('discord.js');
const LanguageManager = require('../managers/LanguageManager');
const buttonHandler = require('../events/buttonHandler');
const { getControllablePlayer } = require('../utils/PlayerCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Applies an audio filter')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Filter to apply')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Bass Boost', value: 'bassboost' },
                    { name: 'Nightcore', value: 'nightcore' },
                    { name: 'Vaporwave', value: 'vaporwave' },
                    { name: '8D', value: '8d' }
                )),

    async execute(interaction, client) {
        const player = await getControllablePlayer(interaction);
        if (!player) return;

        if (!buttonHandler.isAuthorized(interaction, player.requesterId)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(interaction.guild?.id, 'buttonhandler.not_authorized'),
                flags: [1 << 6]
            });
        }

        const name = interaction.options.getString('name');
        await interaction.deferReply({ flags: [1 << 6] });
        const applied = await player.setFilter(name === 'off' ? null : name);

        let content = name === 'off' ? '🎛️ Filter turned off.' : `🎛️ Filter set to ${name}.`;
        if (!applied) content = '❌ Couldn\'t restart the song with the new filter.';
        await interaction.editReply({ content });
    }
};
