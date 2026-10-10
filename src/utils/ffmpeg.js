const { spawnSync } = require('child_process');

/**
 * Resolves the FFmpeg binary: FFMPEG_PATH, then a system-wide `ffmpeg` on PATH,
 * then the bundled ffmpeg-static build as a fallback.
 */
function resolveFfmpegPath() {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true });
    if (!probe.error && probe.status === 0) return 'ffmpeg';

    return require('ffmpeg-static');
}

module.exports = resolveFfmpegPath();
