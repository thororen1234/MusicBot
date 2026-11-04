const { ApplicationCommandOptionType } = require('discord.js');

// Reply options that only make sense for interactions
function toMessagePayload(options) {
    const payload = typeof options === 'string' ? { content: options } : { ...options };
    delete payload.flags;
    delete payload.ephemeral;
    delete payload.fetchReply;
    delete payload.withResponse;
    return payload;
}

function findChoice(option, raw) {
    const wanted = raw.toLowerCase();
    return option.choices.find(choice =>
        String(choice.value).toLowerCase() === wanted || choice.name.toLowerCase() === wanted
    );
}

function parseValue(option, raw) {
    switch (option.type) {
        case ApplicationCommandOptionType.Integer:
        case ApplicationCommandOptionType.Number: {
            const value = option.type === ApplicationCommandOptionType.Integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
            if (!Number.isFinite(value) || !/^-?\d+(\.\d+)?$/.test(raw)) {
                throw new Error(`\`${option.name}\` must be a number.`);
            }
            if ((option.min_value !== undefined && value < option.min_value) || (option.max_value !== undefined && value > option.max_value)) {
                throw new Error(`\`${option.name}\` must be between ${option.min_value ?? '-∞'} and ${option.max_value ?? '∞'}.`);
            }
            return value;
        }
        case ApplicationCommandOptionType.Boolean:
            if (/^(true|yes|on|1)$/i.test(raw)) return true;
            if (/^(false|no|off|0)$/i.test(raw)) return false;
            throw new Error(`\`${option.name}\` must be true or false.`);
        default:
            return raw;
    }
}

/**
 * Parses prefix arguments against a slash command's options.
 * `name:value` sets an option by name (e.g. `source:tidal`); the remaining text fills the
 * first unset string/number option, so `!!play never gonna give you up` sets `query`.
 */
function parseOptions(command, argsText, message) {
    const definitions = command.data.toJSON().options || [];
    const values = new Map();
    let rest = argsText;

    for (const option of definitions) {
        if (option.type === ApplicationCommandOptionType.Attachment) continue;
        const pattern = new RegExp(`(?:^|\\s)${option.name}:(\\S+)`, 'i');
        const match = rest.match(pattern);
        if (!match) continue;
        values.set(option.name, match[1]);
        rest = (rest.slice(0, match.index) + rest.slice(match.index + match[0].length)).trim();
    }

    rest = rest.trim();
    if (rest) {
        const positional = definitions.find(option =>
            !values.has(option.name) && option.type !== ApplicationCommandOptionType.Attachment
        );
        if (!positional) throw new Error(`\`${command.data.name}\` doesn't take any arguments.`);
        values.set(positional.name, rest);
    }

    const parsed = new Map();
    const attachments = [...message.attachments.values()];

    for (const option of definitions) {
        if (option.type === ApplicationCommandOptionType.Attachment) {
            const attachment = attachments.shift();
            if (attachment) parsed.set(option.name, attachment);
        } else if (values.has(option.name)) {
            let raw = values.get(option.name);
            if (option.choices?.length) {
                const choice = findChoice(option, raw);
                if (!choice) {
                    throw new Error(`\`${option.name}\` must be one of: ${option.choices.map(c => c.value).join(', ')}.`);
                }
                raw = String(choice.value);
            }
            parsed.set(option.name, parseValue(option, raw));
        }

        if (option.required && !parsed.has(option.name)) {
            throw new Error(`Missing \`${option.name}\`.`);
        }
    }

    const get = name => parsed.has(name) ? parsed.get(name) : null;
    return {
        get: name => (parsed.has(name) ? { name, value: parsed.get(name) } : null),
        getString: get,
        getInteger: get,
        getNumber: get,
        getBoolean: get,
        getAttachment: get,
    };
}

/**
 * Wraps a message so slash command handlers can run on it unchanged.
 * The first reply answers the message; editReply edits that reply.
 */
function createMessageInteraction(message, command, options) {
    const interaction = {
        commandName: command.data.name,
        client: message.client,
        guild: message.guild,
        guildId: message.guildId,
        member: message.member,
        channel: message.channel,
        channelId: message.channelId,
        user: message.author,
        options,
        deferred: false,
        replied: false,
        replyMessage: null,
        isPrefixCommand: true,

        isChatInputCommand: () => false,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isRepliable: () => true,

        async deferReply() {
            this.deferred = true;
            await message.channel.sendTyping().catch(() => null);
        },

        async reply(replyOptions) {
            this.replyMessage = await message.reply({
                allowedMentions: { repliedUser: false },
                ...toMessagePayload(replyOptions)
            });
            this.replied = true;
            return this.replyMessage;
        },

        async editReply(replyOptions) {
            if (!this.replyMessage) {
                const payload = toMessagePayload(replyOptions);
                if (payload.content === null) delete payload.content;
                return await this.reply(payload);
            }
            this.replyMessage = await this.replyMessage.edit(toMessagePayload(replyOptions));
            return this.replyMessage;
        },

        async followUp(replyOptions) {
            return await message.channel.send(toMessagePayload(replyOptions));
        },

        async fetchReply() {
            return this.replyMessage;
        },

        async deleteReply() {
            await this.replyMessage?.delete().catch(() => null);
        },

        // Modals need a real interaction
        async showModal() {
            return await this.reply({ content: `❌ This needs the slash command: \`/${command.data.name}\`.` });
        },
    };

    return interaction;
}

module.exports = { parseOptions, createMessageInteraction };
