const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const MusicPlayer = require('../managers/MusicPlayer');
const MusicEmbedManager = require('../managers/MusicEmbedManager');
const LanguageManager = require('../managers/LanguageManager');
const ErrorHandler = require('../utils/ErrorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays music from a query, supported link, or uploaded file')
        .addStringOption(option =>
            option.setName('query')
            .setDescription('Song, supported URL, ftts://text, or direct audio link')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('An audio or video file to play')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Where to play searches and Spotify/Apple Music/Deezer links from')
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Tidal', value: 'tidal' },
                    { name: 'SoundCloud', value: 'soundcloud' }
                )
        ),

    async execute(interaction, client) {
        try {
            // Defer reply
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }

            const attachment = interaction.options.getAttachment('file');
            const queryInput = interaction.options.getString('query');
            const query = queryInput || attachment?.name;
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
            if (!query) {
                return await interaction.editReply({ content: '❌ Provide a song or URL, or attach an audio/video file.' });
            }
            if (attachment && queryInput) {
                return await interaction.editReply({ content: '❌ Provide either a query/URL or a file attachment, not both.' });
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

            const ExternalSources = require('../providers/ExternalSources');
            if (ExternalSources.requiresNsfwChannel(query) && !channel.nsfw) {
                return await interaction.editReply({ content: '❌ This source can only be used in an age-restricted channel.' });
            }

            // Sadece müzik verilerini al (player'a ekleme yapma)
            const source = interaction.options.getString('source') || config.bot.defaultSource;
            const trackData = await this.getTrackData(query, guild.id, source, attachment);

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

    async getTrackData(query, guildId, source = 'youtube', attachment = null) {
        const YouTube = require('../providers/YouTube');
        const Spotify = require('../providers/Spotify');
        const SongLink = require('../providers/SongLink');
        const Tidal = require('../providers/Tidal');
        const SoundCloud = require('../providers/SoundCloud');
        const DirectLink = require('../providers/DirectLink');
        const ExternalSources = require('../providers/ExternalSources');
        const FloweryTTS = require('../providers/FloweryTTS');
        const SpeechTTS = require('../providers/SpeechTTS');
        const StreamDeckAudio = require('../providers/StreamDeckAudio');
        const UploadedFile = require('../providers/UploadedFile');

        try {
            let tracks = [];
            let isPlaylist = false;

            if (attachment) {
                if (!UploadedFile.isEnabled()) {
                    return { success: false, message: this.getProviderDisabledMessage('upload') };
                }
                return { success: true, isPlaylist: false, tracks: [UploadedFile.getTrack(attachment)] };
            }

            if (source === 'tidal' && !config.providers.isEnabled('tidal')) {
                return { success: false, message: this.getProviderDisabledMessage('tidal') };
            }
            if (source === 'tidal' && !Tidal.isConfigured()) {
                return { success: false, message: await LanguageManager.getTranslation(guildId, 'tidal.not_configured') };
            }

            // Platform tespiti
            const platform = this.detectPlatform(query);
            const provider = this.getProviderForPlatform(platform, query);
            if (provider && !config.providers.isEnabled(provider)) {
                return { success: false, message: this.getProviderDisabledMessage(provider) };
            }

            switch (platform) {
                case 'flowerytts':
                    tracks = [FloweryTTS.getTrack(query)];
                    break;

                case 'speechtts':
                    tracks = [SpeechTTS.getTrack(query)];
                    break;

                case 'streamdeck':
                    tracks = [StreamDeckAudio.getTrack(query)];
                    break;

                case 'search':
                    if (source === 'tidal') {
                        // Only play from Tidal when it has an exact match, otherwise search YouTube
                        try {
                            const match = await Tidal.findExact(query);
                            if (match) tracks = [match];
                        } catch (error) {
                            console.error(error.message);
                        }
                    }
                    if (source === 'soundcloud') {
                        // Top full-length SoundCloud result (previews are skipped), otherwise search YouTube
                        try {
                            tracks = await SoundCloud.search(query, 1);
                        } catch (error) {
                            console.error('[SoundCloud] search failed:', error.message);
                        }
                    }
                    if (tracks.length === 0) {
                        if (!config.providers.isEnabled('youtube')) {
                            return { success: false, message: this.getProviderDisabledMessage('youtube') };
                        }
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

                case 'tidal':
                    // Tidal links play straight from Tidal when it's set up
                    try {
                        ({ tracks, isPlaylist } = await Tidal.getFromURL(query));
                    } catch (error) {
                        console.error(error.message);
                    }
                    if (tracks.length > 0) break;
                // Tidal couldn't play it - fall through and resolve the link via SongLink (YouTube fallback)
                case 'songlink': {
                    // Spotify/Apple Music/Deezer/Tidal links -> matching Tidal or YouTube track via the SongLink API.
                    // Tidal links always prefer Tidal when it's set up, whatever the chosen source.
                    const linkSource = Tidal.isConfigured() && Tidal.isTidalURL(query) ? 'tidal' : source;
                    let songlinkError = null;
                    try {
                        ({ tracks, isPlaylist } = await SongLink.getTracks(query, guildId, linkSource));
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
                    // Track, playlist (/sets/) or profile link
                    ({ tracks, isPlaylist } = await SoundCloud.getFromURL(query));
                    break;

                case 'external':
                    ({ tracks, isPlaylist } = await ExternalSources.getFromURL(query));
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
        const SongLink = require('../providers/SongLink');
        const Tidal = require('../providers/Tidal');
        const SoundCloud = require('../providers/SoundCloud');
        const ExternalSources = require('../providers/ExternalSources');
        const FloweryTTS = require('../providers/FloweryTTS');
        const SpeechTTS = require('../providers/SpeechTTS');
        const StreamDeckAudio = require('../providers/StreamDeckAudio');

        if (FloweryTTS.isQuery(query)) {
            return 'flowerytts';
        } else if (SpeechTTS.isQuery(query)) {
            return 'speechtts';
        } else if (StreamDeckAudio.isSupportedURL(query)) {
            return 'streamdeck';
        } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
            return 'youtube';
        } else if (Tidal.isConfigured() && Tidal.parseURL(query)) {
            return 'tidal';
        } else if (SongLink.isSupportedURL(query)) {
            return 'songlink';
        } else if (SoundCloud.isSoundCloudURL(query)) {
            return 'soundcloud';
        } else if (ExternalSources.isSupportedURL(query)) {
            return 'external';
        } else if (query.startsWith('http') && (query.includes('.mp3') || query.includes('.wav') || query.includes('.ogg'))) {
            return 'direct';
        } else if (/^https?:\/\//i.test(query)) {
            return 'youtube'; // Other links keep the old behaviour (YouTube search)
        } else {
            return 'search';
        }
    },

    getProviderForPlatform(platform, query) {
        const SongLink = require('../providers/SongLink');
        const ExternalSources = require('../providers/ExternalSources');
        const providers = {
            youtube: 'youtube',
            soundcloud: 'soundcloud',
            direct: 'direct',
            tidal: 'tidal',
            flowerytts: 'flowerytts',
            speechtts: 'speechtts',
            streamdeck: 'streamdeck',
            upload: 'upload',
        };
        if (platform === 'songlink') return SongLink.getProviderId(query);
        if (platform === 'external') return ExternalSources.getSource(query)?.id || null;
        return providers[platform] || null;
    },

    getProviderDisabledMessage(provider) {
        return `❌ ${config.providers.displayName(provider)} is disabled by this bot's configuration.`;
    }
};
