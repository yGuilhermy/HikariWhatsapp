function mediaError(code, publicMessage) {
    return Object.assign(new Error(publicMessage), { code, publicMessage });
}

function classifyProviderError(stderr, code) {
    if (/\b(?:429|too many requests|rate.?limit)\b/i.test(stderr)) {
        return mediaError('MEDIA_RATE_LIMIT', 'A plataforma limitou os downloads. Tente novamente mais tarde.');
    }
    if (/sign in|private video|requires authentication|login required|age.restricted|\b403\b/i.test(stderr)) {
        return mediaError('MEDIA_RESTRICTED', 'A plataforma restringiu o acesso a essa mídia. Confira se o link é público.');
    }
    if (/exceeds|max.filesize|file is larger/i.test(stderr)) {
        return mediaError('MEDIA_TOO_LARGE', 'O arquivo excede o limite de envio. Tente uma mídia menor.');
    }
    if (/unsupported url|not available|not found|no video|no audio|\b404\b/i.test(stderr)) {
        return mediaError('MEDIA_NO_FILE', 'A plataforma não disponibilizou um arquivo para esse link.');
    }
    return mediaError('MEDIA_PROCESS_FAILED', 'Não consegui preparar a mídia agora. Tente novamente mais tarde.');
}

module.exports = { mediaError, classifyProviderError };
