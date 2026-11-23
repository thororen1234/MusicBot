const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const MusicPlayer = require('../managers/MusicPlayer');
const MusicEmbedManager = require('../managers/MusicEmbedManager');
const ExternalSources = require('../providers/ExternalSources');
const ErrorHandler = require('../utils/ErrorHandler');
const { isExactTrackMatch } = require('../utils/TrackMatch');
const play = require('./play');

const DB_FILE_PATH = path.join(__dirname, '..', '..', 'database', 'playlists.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Save and load your own playlists')
        .addSubcommand(subcommand =>
            subcommand.setName('save')
                .setDescription('Save the current track and queue as a playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Playlist name')
                        .setMaxLength(100)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('import')
                .setDescription('Add the songs of a Spotify, Apple Music, Deezer, Tidal or YouTube playlist to a playlist')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('Playlist or album link')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Playlist name (songs are added if it already exists)')
                        .setMaxLength(100)
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('load')
                .setDescription('Queue one of your playlists')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Playlist name')
                        .setMaxLength(100)
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('List your playlists')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('delete')
                .setDescription('Delete one of your playlists')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Playlist name')
                        .setMaxLength(100)
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString('name')?.trim().slice(0, 100);
            const userId = interaction.user.id;
            const db = this.readPlaylists();
            const playlists = db.users[userId] || [];
            const index = name ? playlists.findIndex(playlist => playlist.name.toLowerCase() === name.toLowerCase()) : -1;

            if (subcommand === 'list') {
                const content = playlists.length
                    ? playlists.map(playlist => `**${playlist.name}** - ${playlist.tracks.length} tracks`).join('\n').slice(0, 2000)
                    : 'You have no saved playlists.';
                return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
            }

            if (!name) {
                return await interaction.reply({ content: '❌ Provide a playlist name.', flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'save') {
                const player = client.players.get(interaction.guild.id);
                const tracks = [player?.currentTrack, ...(player?.queue || [])]
                    .filter(Boolean)
                    .slice(0, config.bot.maxPlaylistSize)
                    .map(track => player.serializeTrack(track));
                if (!tracks.length) {
                    return await interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
                }

                const playlist = { name, tracks, updatedAt: Date.now() };
                if (index === -1) playlists.push(playlist);
                else playlists[index] = playlist;
                db.users[userId] = playlists;
                this.writePlaylists(db);
                return await interaction.reply({ content: `✅ Saved **${name}** (${tracks.length} tracks).`, flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'import') {
                const url = interaction.options.getString('url').trim();
                if (!/^https?:\/\//i.test(url)) {
                    return await interaction.reply({ content: '❌ Provide a playlist link.', flags: MessageFlags.Ephemeral });
                }
                if (ExternalSources.requiresNsfwChannel(url) && !interaction.channel.nsfw) {
                    return await interaction.reply({ content: '❌ This source can only be used in an age-restricted channel.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const trackData = await play.getTrackData(url, interaction.guild.id, config.bot.defaultSource);
                if (!trackData.success) {
                    return await interaction.editReply({ content: trackData.message });
                }

                // Re-read: the lookup can take a while and another save may have landed meanwhile
                const latest = this.readPlaylists();
                const latestPlaylists = latest.users[userId] || [];
                const latestIndex = latestPlaylists.findIndex(playlist => playlist.name.toLowerCase() === name.toLowerCase());
                const existing = latestIndex === -1 ? [] : latestPlaylists[latestIndex].tracks;
                const tracks = [...existing];
                let duplicates = 0;
                let full = false;

                for (const track of trackData.tracks.map(track => MusicPlayer.prototype.serializeTrack(track))) {
                    if (tracks.some(saved => saved.url === track.url || (saved.spotifyUrl && saved.spotifyUrl === track.spotifyUrl) || isExactTrackMatch(saved, track))) {
                        duplicates++;
                    } else if (tracks.length >= config.bot.maxPlaylistSize) {
                        full = true;
                    } else {
                        tracks.push(track);
                    }
                }

                const playlist = { name: latestIndex === -1 ? name : latestPlaylists[latestIndex].name, tracks, updatedAt: Date.now() };
                if (latestIndex === -1) latestPlaylists.push(playlist);
                else latestPlaylists[latestIndex] = playlist;
                latest.users[userId] = latestPlaylists;
                this.writePlaylists(latest);

                let content = `✅ Added ${tracks.length - existing.length} songs to **${playlist.name}**.`;
                if (duplicates) content += ` Skipped ${duplicates} already in it.`;
                if (full) content += ` The playlist is full (${config.bot.maxPlaylistSize} songs).`;
                return await interaction.editReply({ content });
            }

            if (index === -1) {
                return await interaction.reply({ content: `❌ No playlist named **${name}**.`, flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'delete') {
                const [removed] = playlists.splice(index, 1);
                if (playlists.length) db.users[userId] = playlists;
                else delete db.users[userId];
                this.writePlaylists(db);
                return await interaction.reply({ content: `🗑️ Deleted **${removed.name}**.`, flags: MessageFlags.Ephemeral });
            }

            const member = interaction.member;
            const guild = interaction.guild;
            const channel = interaction.channel;

            const validationResult = await play.validateRequest(interaction, member, guild);
            if (!validationResult.success) {
                return await interaction.reply({ content: validationResult.message, flags: MessageFlags.Ephemeral });
            }
            if (!channel.nsfw && playlists[index].tracks.some(track => ExternalSources.requiresNsfwChannel(track.url || ''))) {
                return await interaction.reply({ content: '❌ This source can only be used in an age-restricted channel.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();

            let player = client.players.get(guild.id);
            if (!player) {
                player = new MusicPlayer(guild, channel, member.voice.channel);
                client.players.set(guild.id, player);
            }

            player.voiceChannel = member.voice.channel;
            player.textChannel = channel;

            if (!client.musicEmbedManager) {
                client.musicEmbedManager = new MusicEmbedManager(client);
            }

            const embedResult = await client.musicEmbedManager.handleMusicData(
                guild.id,
                { success: true, isPlaylist: true, tracks: playlists[index].tracks.map(track => player.deserializeTrack(track)).filter(Boolean) },
                member,
                interaction
            );

            if (!embedResult.success) {
                return await interaction.editReply({ content: embedResult.message });
            }
        } catch (error) {
            const errorMsg = await ErrorHandler.handle(error, interaction.guild?.id, 'playlist.execute');

            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: errorMsg });
                } else if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                if (responseError.code !== 10062) {
                    console.error('Error sending error response:', responseError);
                }
            }
        }
    },

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const playlists = this.readPlaylists().users[interaction.user.id] || [];
        await interaction.respond(
            playlists
                .filter(playlist => playlist.name.toLowerCase().includes(focused))
                .slice(0, 25)
                .map(playlist => ({ name: playlist.name, value: playlist.name }))
        );
    },

    readPlaylists() {
        if (!fs.existsSync(DB_FILE_PATH)) return { users: {} };
        const db = JSON.parse(fs.readFileSync(DB_FILE_PATH, 'utf8'));
        db.users ||= {};
        return db;
    },

    writePlaylists(data) {
        fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true });
        fs.writeFileSync(`${DB_FILE_PATH}.tmp`, JSON.stringify(data, null, 4), 'utf8');
        fs.renameSync(`${DB_FILE_PATH}.tmp`, DB_FILE_PATH);
    }
};
