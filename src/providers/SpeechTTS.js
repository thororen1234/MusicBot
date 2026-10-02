const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const MAX_CHARACTERS = 200;

class SpeechTTS {
    static isEnabled() {
        return config.providers.isEnabled('speechtts');
    }

    static isQuery(query) {
        return /^speak:/i.test(query || '');
    }

    static getTrack(query) {
        const text = String(query || '').replace(/^speak:/i, '').trim();
        if (!text) throw new Error('Speech text is required. Use speak:Hello world');
        if (text.length > MAX_CHARACTERS) throw new Error(`Speech text must be ${MAX_CHARACTERS} characters or fewer.`);

        const params = new URLSearchParams({
            tl: config.speechTts.language,
            q: text,
            ie: 'UTF-8',
            total: '1',
            idx: '0',
            textlen: String(text.length),
            client: 'tw-ob',
        });

        return {
            title: `Speaking ${text}`,
            artist: 'Google TTS',
            url: `https://translate.google.com/translate_tts?${params}`,
            duration: 0,
            thumbnail: null,
            platform: 'speechtts',
            type: 'track',
            id: crypto.createHash('sha256').update(`${config.speechTts.language}:${text}`).digest('hex'),
        };
    }

    static async getStream(track) {
        const response = await axios.get(track.url, {
            responseType: 'stream',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36' },
        });
        return {
            stream: response.data,
            duration: track.duration || 0,
            canSeek: false,
        };
    }
}

module.exports = SpeechTTS;
