const LanguageManager = require('../managers/LanguageManager');

/**
 * Shared checks for slash commands that mirror the player control buttons.
 * Replies with the same errors as the buttons and returns null when the user can't control the player.
 */
async function getControllablePlayer(interaction, { requireVoice = true } = {}) {
    const guild = interaction.guild;
    const member = interaction.member;

    if (requireVoice && !member.voice.channel) {
        await interaction.reply({
            content: await LanguageManager.getTranslation(guild?.id, 'buttonhandler.voice_channel_required'),
            flags: [1 << 6]
        });
        return null;
    }

    const player = interaction.client.players.get(guild.id);
    if (!player) {
        await interaction.reply({
            content: await LanguageManager.getTranslation(guild?.id, 'buttonhandler.no_music_playing'),
            flags: [1 << 6]
        });
        return null;
    }

    if (requireVoice && player.voiceChannel.id !== member.voice.channel.id) {
        await interaction.reply({
            content: await LanguageManager.getTranslation(guild?.id, 'buttonhandler.same_channel_required'),
            flags: [1 << 6]
        });
        return null;
    }

    return player;
}

module.exports = { getControllablePlayer };
