const youtubedl = require('youtube-dl-exec');
const config = require('../config');

const YTDLP_OPTIONS = {
    noCheckCertificates: true,
    noWarnings: true,
};

// SoundCloud serves 30 second previews for some label tracks (format IDs end in "_preview")
const PREVIEW_MAX_SECONDS = 30;

/**
 * SoundCloud playback through yt-dlp's native SoundCloud support.
 * Preview-only tracks are flagged with `preview: true` so the player can play the full song from YouTube instead.
 */
class SoundCloud {
    static isSoundCloudURL(url) {
        try {
            const { hostname } = new URL(url);
            return /(^|\.)soundcloud\.com$/.test(hostname.toLowerCase());
        } catch {
            return false;
        }
    }

    /**
     * Resolves a track, playlist (/sets/) or profile link.
     * @returns {Promise<{tracks: object[], isPlaylist: boolean}>}
     */
    static async getFromURL(url) {
        const info = await youtubedl(url, {
            ...YTDLP_OPTIONS,
            dumpSingleJson: true,
            skipDownload: true,
            playlistEnd: config.bot.maxPlaylistSize,
        });

        if (info?._type === 'playlist') {
            const tracks = (info.entries || []).filter(Boolean).map(entry => this.formatTrack(entry));
            return { tracks, isPlaylist: true };
        }
        return { tracks: info ? [this.formatTrack(info)] : [], isPlaylist: false };
    }

    /**
     * Searches SoundCloud, skipping preview-only tracks.
     */
    static async search(query, limit = 1) {
        // Ask for extra results so there are still enough after dropping previews
        const results = await youtubedl(`scsearch${Math.max(limit * 2, 5)}:${query}`, {
            ...YTDLP_OPTIONS,
            dumpSingleJson: true,
            flatPlaylist: true,
        });

        return (results?.entries || [])
            .map(entry => this.formatTrack(entry))
            .filter(track => !track.preview)
            .slice(0, limit);
    }

    /**
     * Prefers a progressive (plain HTTP) stream the player can fetch directly. Tracks that only have HLS
     * are piped through yt-dlp instead, unless `allowPipe` is false (preloading), which returns null.
     */
    static async getStream(url, guildId = null, startSeconds = 0, { allowPipe = true } = {}) {
        const info = await youtubedl(url, {
            ...YTDLP_OPTIONS,
            dumpSingleJson: true,
            format: 'bestaudio[protocol^=http]/bestaudio',
        });

        if (info?.url && /^https?$/.test(info.protocol || '')) {
            return {
                url: info.url,
                duration: info.duration || 0,
                canSeek: false,
                httpHeaders: info.http_headers || {},
            };
        }

        if (!allowPipe) return null;

        const subprocess = youtubedl.exec(url, {
            ...YTDLP_OPTIONS,
            format: 'bestaudio',
            output: '-',
            quiet: true,
        });
        subprocess.catch(() => {}); // Killed when playback stops - not an error
        return {
            stream: subprocess.stdout,
            duration: info?.duration || 0,
            canSeek: false,
        };
    }

    static formatTrack(item) {
        const formats = item.formats || [];
        const preview = formats.length > 0
            ? formats.every(format => /preview/.test(format.format_id || ''))
            : (item.duration || 0) > 0 && item.duration <= PREVIEW_MAX_SECONDS;

        return {
            title: item.title || item.fulltitle || 'Unknown Title',
            artist: item.artist || item.uploader || 'Unknown Artist',
            url: item.webpage_url || item.url,
            duration: preview ? 0 : Math.round(item.duration || 0), // A preview's 30s isn't the song's length
            thumbnail: item.thumbnail || item.thumbnails?.[item.thumbnails.length - 1]?.url || null,
            platform: 'soundcloud',
            type: 'track',
            id: item.id ? String(item.id) : null,
            preview,
        };
    }
}

module.exports = SoundCloud;
