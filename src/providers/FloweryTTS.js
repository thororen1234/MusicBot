const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const MAX_CHARACTERS = 2048;

class FloweryTTS {
    static isEnabled() {
        return config.providers.isEnabled('flowerytts');
    }

    static isQuery(query) {
        return /^(?:ftts:\/\/|tts:)/i.test(query || '');
    }

    static getText(query) {
        const value = String(query || '');
        if (/^ftts:\/\//i.test(value)) {
            const encodedText = value.slice('ftts://'.length).split('?')[0];
            try {
                return decodeURIComponent(encodedText).trim();
            } catch {
                return encodedText.trim();
            }
        }
        return value.replace(/^tts:/i, '').trim();
    }

    static getTrack(query) {
        const text = this.getText(query);
        if (!text) throw new Error('TTS text is required. Use ftts://Hello world');
        if (text.length > MAX_CHARACTERS) throw new Error(`TTS text must be ${MAX_CHARACTERS} characters or fewer.`);

        return {
            title: text,
            artist: 'Flowery TTS',
            url: this.getUrl(text, this.getRequestOptions(query)),
            duration: 0,
            thumbnail: null,
            platform: 'flowerytts',
            type: 'track',
            id: crypto.createHash('sha256').update(text).digest('hex'),
        };
    }

    static getRequestOptions(query) {
        const options = {};
        if (!/^ftts:\/\//i.test(query || '')) return options;

        const queryString = String(query).split('?').slice(1).join('?');
        const params = new URLSearchParams(queryString);
        for (const key of ['voice', 'translate', 'silence', 'speed', 'audio_format']) {
            if (params.has(key)) options[key] = params.get(key);
        }
        return options;
    }

    static getUrl(text, options = {}) {
        const params = new URLSearchParams({
            text,
            translate: options.translate ?? String(config.floweryTts.translate),
            silence: options.silence ?? String(config.floweryTts.silence),
            speed: options.speed ?? String(config.floweryTts.speed),
            audio_format: options.audio_format ?? config.floweryTts.audioFormat,
        });
        const voice = options.voice ?? config.floweryTts.voice;
        if (voice) params.set('voice', voice);
        return `${config.floweryTts.apiUrl}?${params}`;
    }

    static async getStream(track) {
        const response = await axios.get(track.url, {
            responseType: 'stream',
            timeout: 30000,
        });
        return response.data;
    }
}

module.exports = FloweryTTS;
