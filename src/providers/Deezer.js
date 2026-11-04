const axios = require('axios');
const config = require('../config');

/**
 * Reads Deezer playlists, albums and artist top tracks from Deezer's public API (no key needed).
 * The tracks play from YouTube, like Spotify tracks.
 */
class Deezer {
    static isShortLink(url) {
        try {
            return /^(link\.deezer\.com|(deezer|dzr)\.page\.link)$/.test(new URL(url).hostname.toLowerCase());
        } catch {
            return false;
        }
    }

    // deezer.com/[lang/]playlist|album|artist|track/123
    static parseURL(url) {
        const match = url.match(/^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|artist)\/(\d+)/i);
        return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
    }

    static async resolveShortLink(url) {
        try {
            const response = await axios.get(url, { timeout: 10000, maxRedirects: 5 });
            return response.request?.res?.responseUrl || url;
        } catch {
            return url;
        }
    }

    /**
     * Tracks of a playlist, album or artist link, or null if the link isn't one of those.
     * @returns {Promise<object[] | null>}
     */
    static async getCollection(url) {
        const ref = this.parseURL(this.isShortLink(url) ? await this.resolveShortLink(url) : url);
        if (!ref || ref.type === 'track') return null;

        const endpoint = ref.type === 'artist' ? `artist/${ref.id}/top?limit=10` : `${ref.type}/${ref.id}`;
        try {
            const { data } = await axios.get(`https://api.deezer.com/${endpoint}`, { timeout: 15000 });
            if (data?.error) throw new Error(data.error.message || data.error.type);

            const items = ref.type === 'artist' ? data.data : data.tracks?.data;
            return (items || [])
                .filter(item => item.readable !== false)
                .slice(0, config.bot.maxPlaylistSize)
                .map(item => this.formatTrack(item, ref.type === 'album' ? data : item.album));
        } catch (error) {
            console.error(`[Deezer] ${ref.type}/${ref.id} lookup failed:`, error.message);
            return [];
        }
    }

    static formatTrack(item, album) {
        const title = item.title || 'Unknown Title';
        const artist = item.artist?.name || 'Unknown Artist';
        return {
            title,
            artist,
            album: album?.title,
            url: item.link || `https://www.deezer.com/track/${item.id}`,
            duration: item.duration || 0,
            thumbnail: album?.cover_xl || album?.cover_big || null,
            platform: 'deezer',
            type: 'track',
            id: String(item.id),
            searchQuery: `${title} ${artist}`,
        };
    }
}

module.exports = Deezer;
