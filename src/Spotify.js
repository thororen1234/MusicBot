const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../config');
const LanguageManager = require('./LanguageManager');

class Spotify {
    static spotifyApi = null;
    static tokenExpiresAt = 0;

    static isConfigured() {
        const { clientId, clientSecret } = config.spotify;
        return !!clientId && !!clientSecret && clientId !== 'YOUR_SPOTIFY_CLIENT_ID' && clientSecret !== 'YOUR_SPOTIFY_CLIENT_SECRET';
    }

    static async initializeApi() {
        if (!this.spotifyApi) {
            this.spotifyApi = new SpotifyWebApi({
                clientId: config.spotify.clientId,
                clientSecret: config.spotify.clientSecret,
            });
        }

        // Check if token needs refresh
        if (Date.now() >= this.tokenExpiresAt) {
            try {
                const data = await this.spotifyApi.clientCredentialsGrant();
                this.spotifyApi.setAccessToken(data.body.access_token);
                this.tokenExpiresAt = Date.now() + (data.body.expires_in * 1000);
            } catch (error) {
                throw new Error('Spotify API authentication failed');
            }
        }

        return this.spotifyApi;
    }

    static async getFromURL(url, guildId = null) {
        try {
            const { type, id } = this.parseSpotifyURL(url);

            if (!type || !id) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'spotify.invalid_url') : 'Invalid Spotify URL';
                throw new Error(errorMsg);
            }

            await this.initializeApi();

            switch (type) {
                case 'track':
                    return await this.getTrack(id, guildId);
                case 'album':
                    return await this.getAlbum(id, guildId);
                case 'playlist':
                    return await this.getPlaylist(id, guildId);
                case 'artist':
                    return await this.getArtistTopTracks(id, guildId);
                default:
                    const errorMsg = guildId ?
                        await LanguageManager.getTranslation(guildId, 'spotify.unsupported_type').replace('{type}', type) :
                        `Unsupported Spotify type: ${type}`;
                    throw new Error(errorMsg);
            }
        } catch (error) {
            return [];
        }
    }

    static async getTrack(trackId, guildId = null) {
        try {
            const trackInfo = await this.spotifyApi.getTrack(trackId);
            const formattedTrack = await this.formatTrack(trackInfo.body, guildId);
            return formattedTrack ? [formattedTrack] : [];
        } catch (error) {
            return [];
        }
    }

    static async getAlbum(albumId, guildId = null) {
        try {
            const albumInfo = await this.spotifyApi.getAlbum(albumId);
            const tracks = [];

            for (const track of albumInfo.body.tracks.items.slice(0, config.bot.maxPlaylistSize)) {
                // Add album info to track
                track.album = {
                    name: albumInfo.body.name,
                    images: albumInfo.body.images,
                    external_urls: albumInfo.body.external_urls,
                };

                const formattedTrack = await this.formatTrack(track, guildId);
                if (formattedTrack) {
                    tracks.push(formattedTrack);
                }
            }

            return tracks;
        } catch (error) {
            return [];
        }
    }

    static async getPlaylist(playlistId, guildId = null) {
        try {
            const playlistInfo = await this.spotifyApi.getPlaylist(playlistId);
            const tracks = [];

            for (const item of playlistInfo.body.tracks.items.slice(0, config.bot.maxPlaylistSize)) {
                if (item.track && item.track.type === 'track') {
                    const formattedTrack = await this.formatTrack(item.track, guildId);
                    if (formattedTrack) {
                        tracks.push(formattedTrack);
                    }
                }
            }

            return tracks;
        } catch (error) {
            return [];
        }
    }

    static async getArtistTopTracks(artistId, guildId = null) {
        try {
            const topTracks = await this.spotifyApi.getArtistTopTracks(artistId, 'TR'); // Turkey market
            const tracks = [];

            for (const track of topTracks.body.tracks.slice(0, 10)) {
                const formattedTrack = await this.formatTrack(track, guildId);
                if (formattedTrack) {
                    tracks.push(formattedTrack);
                }
            }

            return tracks;
        } catch (error) {
            return [];
        }
    }

    static async formatTrack(spotifyTrack, guildId = null) {
        try {
            const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'spotify.unknown_artist') : 'Unknown Artist';
            const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'spotify.unknown_title') : 'Unknown Title';

            const artists = spotifyTrack.artists?.map(artist => artist.name).join(', ') || unknownArtist;
            const title = spotifyTrack.name || unknownTitle;
            const searchQuery = `${title} ${artists}`;

            const track = {
                title: title,
                artist: artists,
                album: spotifyTrack.album?.name,
                url: spotifyTrack.external_urls?.spotify, // Store Spotify URL, YouTube conversion will be done during play
                spotifyUrl: spotifyTrack.external_urls?.spotify,
                duration: Math.floor(spotifyTrack.duration_ms / 1000),
                thumbnail: spotifyTrack.album?.images?.[0]?.url,
                platform: 'spotify',
                type: 'track',
                id: spotifyTrack.id,
                isrc: spotifyTrack.external_ids?.isrc,
                explicit: spotifyTrack.explicit,
                popularity: spotifyTrack.popularity,
                previewUrl: spotifyTrack.preview_url,
                searchQuery: searchQuery, // Store for YouTube conversion
            };

            return track;
        } catch (error) {
            return null;
        }
    }

    static isSpotifyURL(url) {
        const patterns = [
            /^https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+/,
            /^spotify:(track|album|playlist|artist):[a-zA-Z0-9]+/,
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    static parseSpotifyURL(url) {
        // Handle open.spotify.com URLs
        let match = url.match(/^https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/);
        if (match) {
            return { type: match[1], id: match[2] };
        }

        // Handle spotify: URIs
        match = url.match(/^spotify:(track|album|playlist|artist):([a-zA-Z0-9]+)/);
        if (match) {
            return { type: match[1], id: match[2] };
        }

        return { type: null, id: null };
    }
}

module.exports = Spotify;