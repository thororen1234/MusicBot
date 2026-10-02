const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const config = require('../config');

const SUPPORTED_EXTENSIONS = new Set([
    '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.opus',
    '.webm', '.mp4', '.mkv', '.avi', '.mov',
]);

class UploadedFile {
    static isEnabled() {
        return config.providers.isEnabled('upload');
    }

    static getTrack(attachment) {
        if (!attachment?.url || !attachment?.name) {
            throw new Error('Please attach an audio or video file.');
        }
        if (attachment.size > config.uploads.maxBytes) {
            throw new Error(`Uploads must be ${config.uploads.maxMegabytes} MB or smaller.`);
        }

        const extension = path.extname(attachment.name).toLowerCase();
        const mediaType = attachment.contentType || '';
        if (!SUPPORTED_EXTENSIONS.has(extension) && !/^(audio|video)\//i.test(mediaType)) {
            throw new Error('Unsupported upload type. Attach an audio or video file.');
        }

        return {
            title: path.basename(attachment.name, extension) || attachment.name,
            artist: 'Discord upload',
            url: attachment.url,
            duration: 0,
            thumbnail: attachment.contentType?.startsWith('video/') ? attachment.url : null,
            platform: 'upload',
            type: 'track',
            id: attachment.id || crypto.createHash('sha256').update(attachment.url).digest('hex'),
            filename: attachment.name,
            contentType: mediaType,
            size: attachment.size,
        };
    }

    static async getStream(track) {
        const response = await axios.get(track.url, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
            },
        });
        return {
            stream: response.data,
            duration: track.duration || 0,
            canSeek: false,
        };
    }
}

module.exports = UploadedFile;
