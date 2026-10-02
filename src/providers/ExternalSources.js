const youtubedl = require('youtube-dl-exec');
const config = require('../config');

const YTDLP_OPTIONS = {
    noCheckCertificates: true,
    noWarnings: true,
};

// Services that require an authenticated account still need that account's cookies supplied through the existing COOKIES_* configuration.
const SOURCES = [
    { id: 'yandex', label: 'Yandex Music', hosts: [/(^|\.)music\.yandex\.(ru|com|kz|by|ua)$/] },
    { id: 'vk', label: 'VK Music', hosts: [/(^|\.)vk\.com$/, /(^|\.)vkvideo\.ru$/] },
    { id: 'qobuz', label: 'Qobuz', hosts: [/(^|\.)qobuz\.com$/] },
    { id: 'jiosaavn', label: 'JioSaavn', hosts: [/(^|\.)jiosaavn\.com$/, /(^|\.)saavn\.com$/] },
    { id: 'mixcloud', label: 'Mixcloud', hosts: [/(^|\.)mixcloud\.com$/] },
    { id: 'ocremix', label: 'OC Remix', hosts: [/(^|\.)ocremix\.org$/], identifiers: [/^OCR\d+$/i] },
    { id: 'clypit', label: 'Clyp.it', hosts: [/(^|\.)clyp\.it$/] },
    { id: 'reddit', label: 'Reddit', hosts: [/(^|\.)reddit\.com$/, /(^|\.)redd\.it$/] },
    { id: 'getyarn', label: 'getyarn', hosts: [/(^|\.)getyarn\.io$/, /(^|\.)yarn\.co$/] },
    { id: 'tiktok', label: 'TikTok', hosts: [/(^|\.)tiktok\.com$/] },
    { id: 'soundgasm', label: 'Soundgasm', hosts: [/(^|\.)soundgasm\.net$/] },
    { id: 'pixeldrain', label: 'Pixeldrain', hosts: [/(^|\.)pixeldrain\.com$/] },
    { id: 'tumblr', label: 'Tumblr', hosts: [/(^|\.)tumblr\.com$/] },
    { id: 'pornhub', label: 'Pornhub', nsfw: true, hosts: [/(^|\.)pornhub\.com$/, /(^|\.)pornhubpremium\.com$/], identifiers: [/^phsearch:.+/i] },
];

class ExternalSources {
    static getYtDlpOptions(extraOptions = {}) {
        const options = { ...YTDLP_OPTIONS, ...extraOptions };
        if (config.ytdl.cookiesFromBrowser) options.cookiesFromBrowser = config.ytdl.cookiesFromBrowser;
        else if (config.ytdl.cookiesFile) options.cookies = config.ytdl.cookiesFile;
        return options;
    }

    static getSource(url) {
        const input = String(url || '').trim();
        const identifiedSource = SOURCES.find(source => source.identifiers?.some(pattern => pattern.test(input)));
        if (identifiedSource) return identifiedSource;

        try {
            const hostname = new URL(input).hostname.toLowerCase();
            return SOURCES.find(source => source.hosts.some(pattern => pattern.test(hostname))) || null;
        } catch {
            return null;
        }
    }

    static isSupportedURL(url) {
        return !!this.getSource(url);
    }

    static isEnabled(url) {
        const source = this.getSource(url);
        return !!source && config.providers.isEnabled(source.id);
    }

    static requiresNsfwChannel(url) {
        return !!this.getSource(url)?.nsfw;
    }

    static normalizeInput(input, source) {
        if (source.id === 'ocremix' && /^OCR\d+$/i.test(input)) {
            return `https://ocremix.org/remix/${input.toUpperCase()}`;
        }
        if (source.id === 'pornhub' && /^phsearch:/i.test(input)) {
            return `phsearch1:${input.slice('phsearch:'.length).trim()}`;
        }
        return input;
    }

    /**
     * Resolves a source URL into one or more tracks. yt-dlp owns site-specific
     * extraction, including authentication supplied by its cookie options.
     */
    static async getFromURL(url) {
        const source = this.getSource(url);
        if (!source) return { tracks: [], isPlaylist: false };

        const info = await youtubedl(this.normalizeInput(url, source), this.getYtDlpOptions({
            dumpSingleJson: true,
            skipDownload: true,
            playlistEnd: config.bot.maxPlaylistSize,
        }));

        if (info?._type === 'playlist') {
            return {
                tracks: (info.entries || []).filter(Boolean).map(entry => this.formatTrack(entry, source)),
                isPlaylist: true,
            };
        }
        return { tracks: info ? [this.formatTrack(info, source)] : [], isPlaylist: false };
    }

    /**
     * Prefer an ordinary HTTP stream. Some extractors only expose HLS/DASH;
     * those are piped by yt-dlp while playing but skipped during preloading.
     */
    static async getStream(url, { allowPipe = true } = {}) {
        const info = await youtubedl(url, this.getYtDlpOptions({
            dumpSingleJson: true,
            format: 'bestaudio[protocol^=http]/bestaudio',
        }));

        if (info?.url && /^https?$/.test(info.protocol || '')) {
            return {
                url: info.url,
                duration: info.duration || 0,
                canSeek: false,
                httpHeaders: info.http_headers || {},
            };
        }

        if (!allowPipe) return null;

        const subprocess = youtubedl.exec(url, this.getYtDlpOptions({
            format: 'bestaudio',
            output: '-',
            quiet: true,
        }));
        subprocess.catch(() => { }); // Expected when a stream is stopped.
        return {
            stream: subprocess.stdout,
            duration: info?.duration || 0,
            canSeek: false,
        };
    }

    static formatTrack(item, source) {
        return {
            title: item.title || item.fulltitle || 'Unknown Title',
            artist: item.artist || item.uploader || 'Unknown Artist',
            album: item.album || null,
            url: item.webpage_url || item.original_url || item.url,
            duration: Math.round(item.duration || 0),
            thumbnail: item.thumbnail || item.thumbnails?.[item.thumbnails.length - 1]?.url || null,
            platform: 'external',
            source: source.id,
            sourceName: source.label,
            type: 'track',
            id: item.id ? String(item.id) : null,
        };
    }
}

module.exports = ExternalSources;
