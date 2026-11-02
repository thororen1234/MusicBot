/**
 * Updates the bundled yt-dlp binary to the latest version.
 * Runs as a postinstall script, and the bot calls scheduleYtDlpUpdates() so long-running
 * containers keep up with YouTube changes; an outdated yt-dlp breaks music search.
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const binDir = path.join(__dirname, '..', '..', 'node_modules', 'youtube-dl-exec', 'bin');
const binary = process.platform === 'win32'
    ? path.join(binDir, 'yt-dlp.exe')
    : path.join(binDir, 'yt-dlp');

function updateYtDlp() {
    if (!fs.existsSync(binary)) {
        console.log('ℹ️  yt-dlp binary not found yet, skipping update (will run after package installs).');
        return Promise.resolve();
    }

    console.log('🔄 Updating yt-dlp to latest version...');
    return new Promise(resolve => {
        execFile(binary, ['-U'], { windowsHide: true }, (error, stdout, stderr) => {
            const output = `${stdout}${stderr}`.trim();
            if (output) console.log(output);
            // yt-dlp exits with code 1 when an update was applied on some platforms — not an error
            if (error && error.code !== 1) {
                console.warn('⚠️  yt-dlp update skipped (network issue or already up to date).');
            }
            resolve();
        });
    });
}

function scheduleYtDlpUpdates() {
    updateYtDlp();
    setInterval(updateYtDlp, UPDATE_INTERVAL_MS).unref();
}

if (require.main === module) {
    updateYtDlp();
}

module.exports = { updateYtDlp, scheduleYtDlpUpdates };
