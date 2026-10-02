const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const { Transform } = require('stream');
const config = require('../config');

class StreamDeckAudio {
    static isEnabled() {
        return config.providers.isEnabled('streamdeck');
    }

    static isSupportedURL(url) {
        try {
            const parsed = new URL(url);
            return /^https?:$/.test(parsed.protocol) && parsed.pathname.toLowerCase().endsWith('.streamdeckaudio');
        } catch {
            return false;
        }
    }

    static getTrack(url) {
        const filename = path.basename(new URL(url).pathname) || 'Stream Deck audio';
        return {
            title: filename.replace(/\.streamdeckaudio$/i, ''),
            artist: 'Elgato Stream Deck',
            url,
            duration: 0,
            thumbnail: null,
            platform: 'streamdeck',
            type: 'track',
            id: crypto.createHash('sha256').update(url).digest('hex'),
        };
    }

    // Stream Deck sound files are WAV data with every byte XORed by 0x5E.
    static async getStream(url) {
        const response = await axios.get(url, { responseType: 'stream', timeout: 30000 });
        const decoder = new Transform({
            transform(chunk, encoding, callback) {
                const decoded = Buffer.from(chunk);
                for (let index = 0; index < decoded.length; index++) decoded[index] ^= 0x5E;
                callback(null, decoded);
            },
        });

        return {
            stream: response.data.pipe(decoder),
            duration: 0,
            canSeek: false,
        };
    }
}

module.exports = StreamDeckAudio;
