const axios = require('axios');
const config = require('../config');

/**
 * Reads Apple Music playlists and albums from the track list embedded in the public web page.
 * The tracks play from YouTube, like Spotify tracks.
 */
class AppleMusic {
    // music.apple.com/{country}/playlist|album/{slug}/{id}. Album links with ?i= point at one song.
    static parseURL(url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            return null;
        }
        if (!/^(geo\.)?music\.apple\.com$/.test(parsed.hostname.toLowerCase())) return null;

        const match = parsed.pathname.match(/^\/(?:[a-z]{2}\/)?(playlist|album)\/(?:[^/]+\/)?((?:pl\.)?[\w.-]+)$/i);
        if (!match) return null;
        if (match[1] === 'album' && parsed.searchParams.has('i')) return { type: 'track', id: parsed.searchParams.get('i') };
        return { type: match[1].toLowerCase(), id: match[2] };
    }

    /**
     * Tracks of a playlist or album link, or null if the link isn't one of those.
     * @returns {Promise<object[] | null>}
     */
    static async getCollection(url) {
        const ref = this.parseURL(url);
        if (!ref || ref.type === 'track') return null;

        try {
            const { data: html } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
                timeout: 15000,
            });
            const json = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
            const sections = json && JSON.parse(json).data?.[0]?.data?.sections;
            if (!sections) return [];

            const header = sections.find(section => section.itemKind === 'containerDetailHeaderLockup')?.items?.[0];
            const albumCover = this.artworkUrl(header?.artwork);
            const items = sections.find(section => section.itemKind === 'trackLockup')?.items || [];

            return items
                .filter(item => item.title && !item.isDisabled)
                .slice(0, config.bot.maxPlaylistSize)
                .map(item => {
                    const title = item.title;
                    const artist = item.artistName || 'Unknown Artist';
                    return {
                        title,
                        artist,
                        album: ref.type === 'album' ? header?.title : undefined,
                        url: item.contentDescriptor?.url || url,
                        duration: Math.floor((item.duration || 0) / 1000),
                        thumbnail: this.artworkUrl(item.artwork) || albumCover,
                        platform: 'applemusic',
                        type: 'track',
                        id: item.contentDescriptor?.identifiers?.storeAdamID || item.id,
                        searchQuery: `${title} ${artist}`,
                    };
                });
        } catch (error) {
            console.error(`[Apple Music] ${ref.type}/${ref.id} lookup failed:`, error.message);
            return [];
        }
    }

    static artworkUrl(artwork) {
        const template = artwork?.dictionary?.url;
        return template ? template.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg') : null;
    }
}

module.exports = AppleMusic;
