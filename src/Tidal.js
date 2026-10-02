const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const { isExactQueryMatch } = require('./TrackMatch');

/**
 * Plays music from Tidal through a TidalSubsonic server (https://github.com/vMohammad24/TidalSubsonic),
 * using the standard Subsonic API. Subsonic IDs on that server are Tidal IDs.
 */
class Tidal {
    static isConfigured() {
        const { url, username, password } = config.tidal;
        return !!(url && username && password);
    }

    // Fresh token auth params for every request (token = md5(password + salt))
    static authParams() {
        const salt = crypto.randomBytes(8).toString('hex');
        return {
            u: config.tidal.username,
            t: crypto.createHash('md5').update(config.tidal.password + salt).digest('hex'),
            s: salt,
            v: '1.16.1',
            c: 'MusicBot',
        };
    }

    static async request(endpoint, params = {}) {
        let data;
        try {
            const response = await axios.get(`${config.tidal.url}/rest/${endpoint}`, {
                params: { ...this.authParams(), f: 'json', ...params },
                timeout: 15000,
            });
            data = response.data?.['subsonic-response'];
        } catch (error) {
            const tidalError = new Error(`[Tidal] ${endpoint} failed (${error.response?.status || error.message})`);
            tidalError.reason = error.response?.status === 401 ? 'auth_failed' : 'failed';
            throw tidalError;
        }

        if (!data || data.status !== 'ok') {
            const tidalError = new Error(`[Tidal] ${endpoint} failed (${data?.error?.message || 'bad response'})`);
            tidalError.reason = data?.error?.code === 70 ? 'not_found' : 'failed';
            throw tidalError;
        }
        return data;
    }

    // Any Tidal link, including short links and mixes that parseURL can't read
    static isTidalURL(query) {
        try {
            const { hostname } = new URL(query);
            return /(^|\.)tidal\.(com|link)$/.test(hostname.toLowerCase());
        } catch {
            return false;
        }
    }

    /**
     * Parses tidal.com / listen.tidal.com links.
     * @returns {{type: 'track'|'album'|'playlist', id: string} | null}
     */
    static parseURL(query) {
        let url;
        try {
            url = new URL(query);
        } catch {
            return null;
        }
        if (!/(^|\.)tidal\.com$/.test(url.hostname.toLowerCase())) return null;

        const path = url.pathname.replace(/^\/browse/, '');
        // Album links that point at a single track: /album/123/track/456
        const trackInAlbum = path.match(/^\/album\/\d+\/track\/(\d+)/);
        if (trackInAlbum) return { type: 'track', id: trackInAlbum[1] };

        const match = path.match(/^\/(track|album)\/(\d+)/) || path.match(/^\/(playlist)\/([0-9a-f-]{36})/i);
        return match ? { type: match[1], id: match[2] } : null;
    }

    /**
     * Resolves a Tidal link to tracks.
     * @returns {Promise<{tracks: object[], isPlaylist: boolean}>}
     */
    static async getFromURL(query) {
        const ref = this.parseURL(query);
        if (!ref) return { tracks: [], isPlaylist: false };

        if (ref.type === 'track') {
            const data = await this.request('getSong', { id: ref.id });
            return { tracks: data.song ? [this.formatTrack(data.song)] : [], isPlaylist: false };
        }

        const songs = ref.type === 'album'
            ? (await this.request('getAlbum', { id: ref.id })).album?.song
            : (await this.request('getPlaylist', { id: ref.id })).playlist?.entry;

        return {
            tracks: (songs || []).slice(0, config.bot.maxPlaylistSize).map(song => this.formatTrack(song)),
            isPlaylist: true,
        };
    }

    static async search(query, limit = 1) {
        const data = await this.request('search3', {
            query,
            songCount: limit,
            albumCount: 0,
            artistCount: 0,
        });
        return (data.searchResult3?.song || []).slice(0, limit).map(song => this.formatTrack(song));
    }

    // First of the top results that exactly matches the query, or null
    static async findExact(query) {
        const results = await this.search(query, 5);
        return results.find(track => isExactQueryMatch(query, track)) || null;
    }

    static formatTrack(song) {
        return {
            title: song.title || 'Unknown Title',
            artist: song.artist || 'Unknown Artist',
            album: song.album,
            // Public Tidal link - the authenticated stream URL is only built at play time
            url: `https://tidal.com/browse/track/${song.id}`,
            duration: song.duration || 0,
            thumbnail: this.coverUrl(song.coverArt),
            platform: 'tidal',
            type: 'track',
            id: String(song.id),
        };
    }

    // Tidal cover IDs are UUIDs that map straight to their public image CDN
    static coverUrl(coverArt) {
        if (!coverArt || !/^[0-9a-f-]{36}$/i.test(coverArt)) return null;
        return `https://resources.tidal.com/images/${coverArt.replace(/-/g, '/')}/640x640.jpg`;
    }

    static getStream(track) {
        const id = track.id || this.parseURL(track.url)?.id;
        if (!id) throw new Error('[Tidal] track has no ID');

        const params = new URLSearchParams({ ...this.authParams(), id: String(id) });
        return {
            url: `${config.tidal.url}/rest/stream?${params}`,
            duration: track.duration,
            canSeek: false,
        };
    }
}

module.exports = Tidal;
