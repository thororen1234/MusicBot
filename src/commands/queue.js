const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const LanguageManager = require('../managers/LanguageManager');

const PAGE_SIZE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Shows the music queue')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number to show')
                .setMinValue(1)),

    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const player = client.players.get(guildId);

        if (!this.hasTracks(player)) {
            return await interaction.reply({
                content: await LanguageManager.getTranslation(guildId, 'commands.queue.empty'),
                flags: [1 << 6]
            });
        }

        const page = (interaction.options.getInteger('page') || 1) - 1;
        await interaction.reply(await this.buildQueueMessage(player, guildId, page));
    },

    // Handles the queue_page:<page> pagination buttons
    async handlePageButton(interaction) {
        const guildId = interaction.guild.id;
        const player = interaction.client.players.get(guildId);

        if (!this.hasTracks(player)) {
            return await interaction.update({
                content: await LanguageManager.getTranslation(guildId, 'commands.queue.empty'),
                embeds: [],
                components: []
            });
        }

        const page = parseInt(interaction.customId.split(':')[1], 10) || 0;
        await interaction.update(await this.buildQueueMessage(player, guildId, page));
    },

    hasTracks(player) {
        return !!player && (!!player.currentTrack || player.queue.length > 0);
    },

    async buildQueueMessage(player, guildId, page = 0) {
        const queue = player.queue;
        const totalPages = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
        page = Math.min(Math.max(page, 0), totalPages - 1);

        const lines = [];

        if (player.currentTrack) {
            const track = player.currentTrack;
            const nowPlayingLabel = await LanguageManager.getTranslation(guildId, 'commands.queue.now_playing');
            const position = this.formatDuration(Math.floor(player.getCurrentTime() / 1000));
            const pausedIcon = player.paused ? '⏸️ ' : '';

            lines.push(`**${nowPlayingLabel}**`);
            lines.push(`${pausedIcon}[${this.truncate(track.title)}](${track.url}) \`${position} / ${this.formatDuration(track.duration)}\``);
            lines.push('');
        }

        const upNextLabel = await LanguageManager.getTranslation(guildId, 'commands.queue.up_next', { count: queue.length });
        lines.push(`**${upNextLabel}**`);

        if (queue.length === 0) {
            lines.push(await LanguageManager.getTranslation(guildId, 'commands.queue.nothing_up_next'));
        } else {
            const start = page * PAGE_SIZE;
            queue.slice(start, start + PAGE_SIZE).forEach((track, index) => {
                const requester = track.requestedBy ? ` • <@${track.requestedBy.id}>` : '';
                lines.push(`\`${start + index + 1}.\` [${this.truncate(track.title)}](${track.url}) \`${this.formatDuration(track.duration)}\`${requester}`);
            });
        }

        const modes = [];
        if (player.loop === 'track') modes.push('🔂');
        if (player.loop === 'queue') modes.push('🔁');
        if (player.shuffle) modes.push('🔀');
        if (player.autoplay) modes.push('🎲');

        const footer = await LanguageManager.getTranslation(guildId, 'commands.queue.footer', {
            page: page + 1,
            pages: totalPages,
            count: queue.length + (player.currentTrack ? 1 : 0),
            duration: this.formatDuration(player.getTotalDuration())
        });

        const embed = new EmbedBuilder()
            .setTitle(await LanguageManager.getTranslation(guildId, 'commands.queue.title'))
            .setDescription(lines.join('\n'))
            .setColor(config.bot.embedColor)
            .setFooter({ text: modes.length > 0 ? `${footer} • ${modes.join(' ')}` : footer })
            .setTimestamp();

        if (player.currentTrack?.thumbnail) {
            embed.setThumbnail(player.currentTrack.thumbnail);
        }

        // Custom IDs are page-1 / page / page+1, so they are always unique within the row
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`queue_page:${page - 1}`)
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`queue_page:${page}`)
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`queue_page:${page + 1}`)
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );

        return { content: null, embeds: [embed], components: [row] };
    },

    truncate(text, max = 60) {
        if (!text) return 'Unknown';
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },

    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';

        const totalSeconds = Math.floor(Number(seconds) || 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }
};
