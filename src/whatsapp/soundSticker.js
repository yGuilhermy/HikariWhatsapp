const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');

const STICKER_AUDIO_TAG = (26 << 3) | 2;

function createSoundStickerSender({ proto, prepareWAMessageMedia }) {
    const pending = new AsyncLocalStorage();
    const { StickerMessage, AudioMessage } = proto.Message;
    const usesNativeField = Buffer.from(StickerMessage.encode({ audioMessage: {} }).finish())
        .equals(Buffer.from([0xd2, 0x01, 0x00]));

    if (!usesNativeField) {
        const encode = StickerMessage.encode;
        StickerMessage.encode = function (message, writer) {
            const result = encode.call(this, message, writer);
            const scoped = pending.getStore();
            if (scoped?.audio && message.fileSha256 && scoped.hash.equals(message.fileSha256)) {
                result.uint32(STICKER_AUDIO_TAG).bytes(scoped.audio);
            }
            return result;
        };
    }

    return async (socket, jid, payload, { soundStickerSignal, ...options }, isActive) => {
        soundStickerSignal?.throwIfAborted();
        const { sticker, stickerAudio, stickerAudioSeconds } = payload;
        const { audioMessage } = await prepareWAMessageMedia({
            audio: stickerAudio, mimetype: 'audio/ogg; codecs=opus', seconds: stickerAudioSeconds
        }, { upload: socket.waUploadToServer, mediaUploadTimeoutMs: options.mediaUploadTimeoutMs });
        soundStickerSignal?.throwIfAborted();
        if (!isActive()) throw new Error('Conexão interrompida durante o envio da figurinha.');
        audioMessage.ptt = true;
        const content = { sticker, isAnimated: true, width: 512, height: 512 };
        if (usesNativeField) return socket.sendMessage(jid, { ...content, audioMessage }, options);

        const scoped = {
            hash: createHash('sha256').update(sticker).digest(),
            audio: AudioMessage.encode(audioMessage).finish()
        };
        try {
            return await pending.run(scoped, () => socket.sendMessage(jid, content, options));
        } finally {
            scoped.audio = null;
        }
    };
}

module.exports = { createSoundStickerSender };
