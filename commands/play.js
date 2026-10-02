const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const MusicPlayer = require('../src/MusicPlayer');
const MusicEmbedManager = require('../src/MusicEmbedManager');
const LanguageManager = require('../src/LanguageManager');
const ErrorHandler = require('../src/ErrorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays music - YouTube, Spotify, Apple Music, Deezer, Tidal, SoundCloud or direct links')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name, or a YouTube/Spotify/Apple Music/Deezer/Tidal/SoundCloud/direct link')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Where to play searches and Spotify/Apple Music/Deezer links from')
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Tidal', value: 'tidal' }
                )
        ),

    async execute(interaction, client) {
        try {
            // Defer reply
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }

            const query = interaction.options.getString('query');
            const member = interaction.member;
            const guild = interaction.guild;
            const channel = interaction.channel;

            // Temel kontroller
            const validationResult = await this.validateRequest(interaction, member, guild);
            if (!validationResult.success) {
                return await interaction.editReply({
                    content: validationResult.message
                });
            }

            // Music player al veya oluştur
            let player = client.players.get(guild.id);
            if (!player) {
                player = new MusicPlayer(guild, channel, member.voice.channel);
                client.players.set(guild.id, player);
            }

            // Player kanallarını güncelle
            player.voiceChannel = member.voice.channel;
            player.textChannel = channel;

            // Arama mesajı gönder
            const searchingMsg = await LanguageManager.getTranslation(guild.id, 'commands.play.searching_desc', { query });
            await interaction.editReply({ content: searchingMsg });

            // Sadece müzik verilerini al (player'a ekleme yapma)
            const source = interaction.options.getString('source') || config.bot.defaultSource;
            const trackData = await this.getTrackData(query, guild.id, source);

            if (!trackData.success) {
                return await interaction.editReply({
                    content: trackData.message
                });
            }



            // Embed Manager'a gönder
            if (!client.musicEmbedManager) {
                client.musicEmbedManager = new MusicEmbedManager(client);
            }

            const embedResult = await client.musicEmbedManager.handleMusicData(
                guild.id,
                trackData,
                member,
                interaction
            );

            if (!embedResult.success) {
                return await interaction.editReply({
                    content: embedResult.message
                });
            }

        } catch (error) {
            const errorMsg = await ErrorHandler.handle(error, interaction.guild?.id, 'play.execute');

            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: errorMsg });
                } else if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMsg, ephemeral: true });
                }
            } catch (responseError) {
                console.error('Error sending error response:', responseError);
            }
        }
    },

    async validateRequest(interaction, member, guild) {
        // Ses kanalı kontrolü
        if (!member.voice.channel) {
            const errorMsg = await LanguageManager.getTranslation(guild.id, 'commands.play.voice_channel_required');
            return { success: false, message: errorMsg };
        }

        // İzin kontrolü
        const permissions = member.voice.channel.permissionsFor(guild.members.me);
        if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
            const errorMsg = await LanguageManager.getTranslation(guild.id, 'commands.play.no_permissions');
            return { success: false, message: errorMsg };
        }

        // Bot farklı kanalda mı kontrolü
        const botVoiceChannel = guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== member.voice.channel.id) {
            const errorMsg = await LanguageManager.getTranslation(guild.id, 'commands.play.same_channel_required');
            return { success: false, message: errorMsg };
        }

        return { success: true };
    },

    async getTrackData(query, guildId, source = 'youtube') {
        const YouTube = require('../src/YouTube');
        const Spotify = require('../src/Spotify');
        const SongLink = require('../src/SongLink');
        const Tidal = require('../src/Tidal');
        const SoundCloud = require('../src/SoundCloud');
        const DirectLink = require('../src/DirectLink');

        try {
            let tracks = [];
            let isPlaylist = false;

            if (source === 'tidal' && !Tidal.isConfigured()) {
                return { success: false, message: await LanguageManager.getTranslation(guildId, 'tidal.not_configured') };
            }

            // Platform tespiti
            const platform = this.detectPlatform(query);

            switch (platform) {
                case 'tidal':
                    // Tidal links always play straight from Tidal when it's set up
                    try {
                        ({ tracks, isPlaylist } = await Tidal.getFromURL(query));
                    } catch (error) {
                        console.error(error.message);
                        const errorMsg = await LanguageManager.getTranslation(guildId, `tidal.${error.reason || 'failed'}`);
                        return { success: false, message: errorMsg };
                    }
                    break;

                case 'search':
                    if (source === 'tidal') {
                        try {
                            tracks = await Tidal.search(query, 1);
                        } catch (error) {
                            console.error(error.message);
                            const errorMsg = await LanguageManager.getTranslation(guildId, `tidal.${error.reason || 'failed'}`);
                            return { success: false, message: errorMsg };
                        }
                    } else {
                        tracks = await YouTube.search(query, 1, guildId);
                    }
                    break;

                case 'youtube':
                    // YouTube playlist/video kontrolü
                    if (YouTube.isPlaylist && YouTube.isPlaylist(query)) {
                        const playlistData = await YouTube.getPlaylist(query, guildId);
                        if (playlistData && playlistData.tracks && playlistData.tracks.length > 0) {
                            tracks = playlistData.tracks;
                            isPlaylist = true;
                        } else {
                            // Playlist yüklenemezse normal arama yap
                            tracks = await YouTube.search(query, 1, guildId);
                        }
                    } else {
                        tracks = await YouTube.search(query, 1, guildId);
                    }
                    break;

                case 'songlink': {
                    // Spotify/Apple Music/Deezer/Tidal links -> matching Tidal or YouTube track via the SongLink API
                    let songlinkError = null;
                    try {
                        ({ tracks, isPlaylist } = await SongLink.getTracks(query, guildId, source));
                    } catch (error) {
                        songlinkError = error;
                        console.error(error.message);
                    }

                    // SongLink can't resolve Spotify playlists/artists/albums to YouTube - use the Spotify API for those when it's set up
                    if (tracks.length === 0 && Spotify.isSpotifyURL(query) && Spotify.isConfigured()) {
                        tracks = await Spotify.getFromURL(query, guildId) || [];
                        const { type } = Spotify.parseSpotifyURL(query);
                        isPlaylist = type === 'playlist' || type === 'album' || type === 'artist';
                    }

                    if (tracks.length === 0) {
                        const reason = songlinkError?.reason || 'not_found';
                        const errorMsg = await LanguageManager.getTranslation(guildId, `songlink.${reason}`);
                        return { success: false, message: errorMsg };
                    }
                    break;
                }

                case 'soundcloud':
                    const soundcloudData = await SoundCloud.search(query, 1, guildId);
                    tracks = soundcloudData || [];
                    break;

                case 'direct':
                    const directData = await DirectLink.getInfo(query);
                    tracks = directData || [];
                    break;

                default:
                    // Varsayılan YouTube arama
                    tracks = await YouTube.search(query, 1, guildId);
            }

            if (!tracks || tracks.length === 0) {
                const errorMsg = await LanguageManager.getTranslation(guildId, 'musicplayer.no_results_found');
                return { success: false, message: errorMsg };
            }

            return {
                success: true,
                isPlaylist: isPlaylist,
                tracks: tracks
            };

        } catch (error) {
            const errorMsg = await ErrorHandler.handle(error, guildId, 'play.getTrackData');
            return { success: false, message: errorMsg };
        }
    },

    detectPlatform(query) {
        const SongLink = require('../src/SongLink');
        const Tidal = require('../src/Tidal');

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            return 'youtube';
        } else if (Tidal.isConfigured() && Tidal.parseURL(query)) {
            return 'tidal';
        } else if (SongLink.isSupportedURL(query)) {
            return 'songlink';
        } else if (query.includes('soundcloud.com')) {
            return 'soundcloud';
        } else if (query.startsWith('http') && (query.includes('.mp3') || query.includes('.wav') || query.includes('.ogg'))) {
            return 'direct';
        } else if (/^https?:\/\//i.test(query)) {
            return 'youtube'; // Other links keep the old behaviour (YouTube search)
        } else {
            return 'search';
        }
    }
};