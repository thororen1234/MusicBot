const { Events } = require('discord.js');
const { default: chalk } = require('chalk');
const config = require('../config');
const { parseOptions, createMessageInteraction } = require('../utils/PrefixCommand');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const prefix = config.bot.prefix;
        if (!prefix || message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

        const body = message.content.slice(prefix.length).trim();
        const [name] = body.split(/\s+/, 1);
        if (!name) return;

        const command = message.client.commands.get(name.toLowerCase());
        if (!command) return;

        let options;
        try {
            options = parseOptions(command, body.slice(name.length).trim(), message);
        } catch (error) {
            return await message.reply({ content: `❌ ${error.message}`, allowedMentions: { repliedUser: false } }).catch(() => null);
        }

        const interaction = createMessageInteraction(message, command, options);

        try {
            await command.execute(interaction, message.client);
        } catch (error) {
            console.error(chalk.red(`❌ Error executing ${prefix}${command.data.name}:`), error);
            await message.reply({
                content: '❌ An error occurred while executing this command!',
                allowedMentions: { repliedUser: false }
            }).catch(() => null);
        }
    }
};
