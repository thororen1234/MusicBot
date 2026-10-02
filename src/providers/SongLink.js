const axios = require('axios');
const config = require('../config');
const YouTube = require('./YouTube');
const Tidal = require('./Tidal');
const { normalizeTitle, isExactTrackMatch } = require('../utils/TrackMatch');

// Music services resolved through the SongLink API (YouTube and SoundCloud links are played natively)
const SUPPORTED_HOSTS = [
    /^(open|play)\.spotify\.com$/,
    /^spotify(\.app)?\.link$/,
    /^(geo\.)?(music|itunes)\.apple\.com$/,
    /^apple\.co$/,
    /(^|\.)deezer\.com$/,
    /^(deezer|dzr)\.page\.link$/,
    /(^|\.)tidal\.com$/,
    /^tidal\.link$/,
];

/**
 * Converts music links from other services (Spotify, Apple Music, Deezer, Tidal)
 * into YouTube tracks using the self-hosted SongLink API (Odesli-compatible).
 */
class SongLink {
    static isSupportedURL(query) {
        if (/^spotify:[a-z]+:/.test(query)) return true;

        try {
            const { hostname } = new URL(query);
            return SUPPORTED_HOSTS.some(pattern => pattern.test(hostname.toLowerCase()));
        } catch {
            return false;
        }
    }

    static async getLinks(url) {
        const params = { url, songIfSingle: true };
        if (config.songlink.apiKey) params.key = config.songlink.apiKey;

        try {
            const { data } = await axios.get(`${config.songlink.apiUrl}/v1/links`, {
                params,
                timeout: 20000,
            });
            return data;
        } catch (error) {
            const status = error.response?.status;
            const code = error.response?.data?.code;
            let reason = 'failed';
            if (status === 401) reason = 'invalid_key';
            else if (code === 'platform_not_configured') reason = 'platform_unavailable';
            else if (code === 'could_not_resolve_entity' || code === 'invalid_url' || status === 404) reason = 'not_found';

            const songlinkError = new Error(`[SongLink] lookup failed (${code || status || error.message})`);
            songlinkError.reason = reason;
            throw songlinkError;
        }
    }

    /**
     * Resolves a music link to playable tracks - from Tidal when `source` is 'tidal' and there's a match,
     * otherwise from YouTube.
     * @returns {Promise<{tracks: object[], isPlaylist: boolean}>}
     */
    static async getTracks(url, guildId = null, source = 'youtube') {
        const data = await this.getLinks(url);
        const entity = data.entitiesByUniqueId?.[data.entityUniqueId] || {};
        const links = data.linksByPlatform || {};

        if (source === 'tidal' && links.tidal?.url && Tidal.parseURL(links.tidal.url)) {
            try {
                const result = await Tidal.getFromURL(links.tidal.url);
                if (result.tracks.length > 0 && this.isExactMatch(entity, result)) return result;
            } catch (error) {
                console.error(error.message);
            }
        }

        const youtubeUrl = links.youtube?.url || this.toYouTubeURL(links.youtubeMusic?.url);

        // The API only matches songs on YouTube, so albums have no YouTube link
        if (entity.type === 'album' && !youtubeUrl) {
            const albumError = new Error('[SongLink] albums have no YouTube match');
            albumError.reason = 'album_unsupported';
            throw albumError;
        }

        let ytTrack = youtubeUrl ? await YouTube.getInfo(youtubeUrl, guildId) : null;
        if (!ytTrack && entity.title) {
            const query = [entity.title, entity.artistName].filter(Boolean).join(' ');
            [ytTrack] = await YouTube.search(query, 1, guildId);
        }
        if (!ytTrack) {
            return { tracks: [], isPlaylist: false };
        }

        // Play the YouTube audio, but keep the clean metadata from the source service
        const { formats, ...track } = ytTrack;
        return {
            tracks: [{
                ...track,
                title: entity.title || track.title,
                artist: entity.artistName || track.artist,
                thumbnail: entity.thumbnailUrl || track.thumbnail,
                sourceUrl: url,
                songlinkUrl: data.pageUrl || null,
            }],
            isPlaylist: false,
        };
    }

    // Only trust the Tidal match when it is exactly the requested song/album, otherwise fall back to YouTube
    static isExactMatch(entity, result) {
        if (!entity.title) return true;
        if (entity.type === 'album') {
            return normalizeTitle(entity.title) === normalizeTitle(result.tracks[0].album);
        }
        return isExactTrackMatch({ title: entity.title, artist: entity.artistName }, result.tracks[0]);
    }

    // music.youtube.com links -> www.youtube.com so the existing YouTube helpers recognise them
    static toYouTubeURL(url) {
        if (!url) return null;
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.endsWith('youtube.com')) return null;
            parsed.hostname = 'www.youtube.com';
            return parsed.toString();
        } catch {
            return null;
        }
    }
}

module.exports = SongLink;
