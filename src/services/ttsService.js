const {logger} = require('../utils/logger');


const {spawn: spawn} = require("child_process");

const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const config = require("../config");

const PHONETIC_DICT = {
    r_pubg: [ /\bpubg\b/gi, "púbiji" ],
    r_pc: [ /\bpc\b/gi, "computador" ],
    r_fps: [ /\bfps\b/gi, "quadros por segundo" ],
    r_windows: [ /\bwindows\b/gi, "uíndous" ],
    r_app: [ /\bapp\b/gi, "aplicativo" ],
    r_apps: [ /\bapps\b/gi, "aplicativos" ],
    r_game: [ /\bgame\b/gi, "gueime" ],
    r_games: [ /\bgames\b/gi, "gueimes" ],
    r_gameplay: [ /\bgameplay\b/gi, "gueime-plei" ],
    r_stream: [ /\bstream\b/gi, "strim" ],
    r_streaming: [ /\bstreaming\b/gi, "striming" ],
    r_live: [ /\blive\b/gi, "laive" ],
    r_lives: [ /\blives\b/gi, "laives" ],
    r_online: [ /\bonline\b/gi, "on-laine" ],
    r_offline: [ /\boffline\b/gi, "óf-laine" ],
    r_call: [ /\bcall\b/gi, "cól" ],
    r_mute: [ /\bmute\b/gi, "miút" ],
    r_unmute: [ /\bunmute\b/gi, "anmiút" ],
    r_lag: [ /\blag\b/gi, "lég" ],
    r_bug: [ /\bbug\b/gi, "bág" ],
    r_drop: [ /\bdrop\b/gi, "dróp" ],
    r_setup: [ /\bsetup\b/gi, "setáp" ],
    r_spotify: [ /\bspotify\b/gi, "spotifai" ],
    r_youtube: [ /\byoutube\b/gi, "iutubi" ],
    r_playlist: [ /\bplaylist\b/gi, "pleilist" ],
    r_playlists: [ /\bplaylists\b/gi, "pleilists" ],
    r_bluetooth: [ /\bbluetooth\b/gi, "blutuf" ],
    r_wifi: [ /\bwi-fi\b|\bwifi\b/gi, "uai-fai" ],
    r_bot: [ /\bbot\b/gi, "bót" ],
    r_ia: [ /\bia\b/gi, "inteligência artificial" ],
    r_dm: [ /\bdm\b/gi, "mensagem privada" ],
    r_dms: [ /\bdms\b/gi, "mensagens privadas" ]
};

const SPOKEN_WORDS = {
    vc: 'você', vcs: 'vocês', pq: 'porque', q: 'que', tb: 'também', tbm: 'também',
    blz: 'beleza', vlw: 'valeu', obg: 'obrigado', msg: 'mensagem', msgs: 'mensagens',
    pf: 'por favor', pfv: 'por favor', hj: 'hoje', td: 'tudo', dps: 'depois',
    agr: 'agora', mt: 'muito', mto: 'muito', cmg: 'comigo', ctg: 'contigo', ñ: 'não'
};

function cleanForTts(rawText) {
    if (typeof rawText !== 'string') return '';
    let text = rawText.normalize('NFC')
        .replace(/^[ \t]*-#[^\n]*/gm, '')
        .replace(/```[\s\S]*?(?:```|$)/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!?\[([^\]\n]+)\]\((?:(?:[^()\n]|\([^()\n]*\))*)\)/g, '$1')
        .replace(/<(?:@!?|@&|#)\d+>|<a?:\w+:\d+>/g, ' ')
        .replace(/(?:https?:\/\/|www\.)[^\s<>()\[\]{}]+/giu, ' ')
        .replace(/[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}/gu, ' ')
        .replace(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}(?:[/?#][^\s<>()\[\]{}]*)?/gu, ' ')
        .replace(/[0-9#*]\uFE0F?\u20E3/g, ' ')
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Default_Ignorable_Code_Point}]+/gu, ' ')
        .replace(/¯\\?_\([^()\n]{1,25}\)_\/¯/gu, ' ')
        .replace(/[(（][^()（）\n]{1,40}[)）]/gu, fragment =>
            !/[\p{Script=Latin}\p{N}]/u.test(fragment) && /[\p{S}\p{P}^_]/u.test(fragment.slice(1,-1)) ? ' ' : fragment)
        .replace(/(?<![\p{L}\p{N}])(?:[:;=][-^']?[)(DPp/|]|[<>^;Tt]_[<>^;Tt]|k{3,}|(?:rs){2,}|xd)(?![\p{L}\p{N}])/giu, ' ')
        .replace(/^[ \t]*(?:[-+*•>]+|\d+[.)])[ \t]+/gm, '')
        .replace(/[^\p{L}\p{M}\p{N}\p{Sc}\s.,;:!?"'()/%+°–—-]+/gu, ' ')
        .replace(/\(\s*\)/g, ' ');

    text = text.replace(/[\p{L}\p{M}\p{N}]+/gu, word => {
        const replacement = SPOKEN_WORDS[word.toLowerCase()];
        if (typeof replacement !== 'string') return word;
        return /^\p{Lu}/u.test(word) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
    });
    for (const [pattern, replacement] of Object.values(PHONETIC_DICT)) {
        text = text.replace(pattern, replacement);
    }
    text = text.replace(/\s+([,.;:?!])/g, '$1').replace(/([!.?])\1+/g, '$1').replace(/\s+/g, ' ').trim();
    return /[\p{L}\p{N}]/u.test(text) ? text : '';
}

async function synthesizeModal(text, options = {}) {
    const endpoint = options.modalEndpoint || config.modalTtsEndpoint || process.env.MODAL_TTS_ENDPOINT;
    if (!endpoint) throw new Error("MODAL_TTS_ENDPOINT não configurado");
    const payload = {
        text: text,
        model: options.model || "v1",
        speed: options.speed || config.voiceSpeed || 1.15,
        temperature: options.temperature || config.voiceTemperature || .65,
        pause_spacing_ms: options.pauseSpacingMs || 200
    };
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 9e4);
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            throw new Error(`Modal TTS retornou status ${response.status}: ${response.statusText}`);
        }
        const arrayBuf = await response.arrayBuffer();
        return Buffer.from(arrayBuf);
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

async function synthesizeHf(text, options = {}) {
    const endpoint = options.hfEndpoint || config.hfTtsEndpoint || process.env.HF_TTS_ENDPOINT;
    if (!endpoint) throw new Error("HF_TTS_ENDPOINT não configurado");
    const token = config.hfToken || process.env.HF_TOKEN || "";
    const {Client: Client} = await (import("@gradio/client"));
    const client = await Client.connect(endpoint, token ? {
        hf_token: token
    } : {});
    const timeoutMs = options.timeoutMs || 35e3;
    const predictPromise = client.predict("/synthesize", [ text, options.model || "v1", options.speed || config.voiceSpeed || 1.15, options.temperature || config.voiceTemperature || .65, options.pauseSpacingMs || 200 ]);
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timeout no Hugging Face")), timeoutMs);
    });
    let result;
    try {
        result = await Promise.race([ predictPromise, timeoutPromise ]);
    } finally {
        clearTimeout(timer);
    }
    const fileObj = result?.data?.[0];
    const audioUrl = fileObj?.url || (fileObj?.path ? `${endpoint}/file=${fileObj.path}` : null);
    if (!audioUrl) throw new Error("HF Space não retornou arquivo de áudio");
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const audioRes = await fetch(audioUrl, {
        headers: headers
    });
    if (!audioRes.ok) throw new Error(`Falha ao baixar áudio do HF: ${audioRes.status}`);
    const arrayBuf = await audioRes.arrayBuffer();
    return Buffer.from(arrayBuf);
}

async function synthesizeAudio(text, options = {}) {
    const cleanText = cleanForTts(text);
    if (!cleanText || cleanText.length < 2) return null;
    try {
        const wavBuffer = await synthesizeHf(cleanText, options);
        if (wavBuffer && wavBuffer.length > 1e3) return wavBuffer;
    } catch (hfErr) {
        logger.warn("[TTS] Falha no Hugging Face, tentando fallback Modal:", hfErr.message);
    }
    try {
        const wavBuffer = await synthesizeModal(cleanText, options);
        if (wavBuffer && wavBuffer.length > 1e3) return wavBuffer;
    } catch (modalErr) {
        logger.error("[TTS] Falha no fallback Modal:", modalErr.message);
    }
    return null;
}

function convertWavToOggOpus(wavBuffer) {
    return new Promise(resolve => {
        let isDone = false;
        const ffmpeg = spawn(config.ffmpegPath, [ "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "48k", "-vbr", "on", "-f", "ogg", "pipe:1" ]);
        const chunks = [];
        const timer = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                try {
                    ffmpeg.kill("SIGKILL");
                } catch (_) {}
                resolve(null);
            }
        }, 1e4);
        ffmpeg.stdout.on("data", chunk => chunks.push(chunk));
        ffmpeg.stderr.on("data", () => {});
        ffmpeg.on("close", code => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            } else {
                resolve(null);
            }
        });
        ffmpeg.on("error", () => {
            if (isDone) return;
            isDone = true;
            clearTimeout(timer);
            resolve(null);
        });
        ffmpeg.stdin.on("error", () => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve(null);
            }
        });
        try {
            if (ffmpeg.stdin && ffmpeg.stdin.writable) {
                ffmpeg.stdin.write(wavBuffer);
                ffmpeg.stdin.end();
            } else if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve(null);
            }
        } catch (_) {
            if (!isDone) {
                isDone = true;
                clearTimeout(timer);
                resolve(null);
            }
        }
    });
}

function extractWaveformAndDuration(wavBuffer) {
    const dataOffset = 44;
    const sampleRate = 24e3;
    const bytesPerSample = 2;
    const dataSize = Math.max(0, wavBuffer.length - dataOffset);
    const totalSamples = Math.floor(dataSize / bytesPerSample);
    const durationSecs = Number(Math.max(.1, totalSamples / sampleRate).toFixed(2));
    if (totalSamples <= 0) {
        return {
            durationSecs: durationSecs,
            waveform: Buffer.from(new Uint8Array(256).fill(128)).toString("base64")
        };
    }
    const blockSize = Math.max(1, Math.floor(totalSamples / 256));
    const waveform = new Uint8Array(256);
    let globalMax = 1;
    const blockPeaks = new Float32Array(256);
    for (let b = 0; b < 256; b++) {
        let blockPeak = 0;
        const startSample = b * blockSize;
        const endSample = Math.min(startSample + blockSize, totalSamples);
        for (let s = startSample; s < endSample; s++) {
            const byteOffset = dataOffset + s * 2;
            if (byteOffset + 1 < wavBuffer.length) {
                const val = Math.abs(wavBuffer.readInt16LE(byteOffset));
                if (val > blockPeak) blockPeak = val;
            }
        }
        blockPeaks[b] = blockPeak;
        if (blockPeak > globalMax) globalMax = blockPeak;
    }
    for (let b = 0; b < 256; b++) {
        waveform[b] = Math.min(255, Math.max(8, Math.round(blockPeaks[b] / globalMax * 255)));
    }
    return {
        durationSecs: durationSecs,
        waveform: Buffer.from(waveform).toString("base64")
    };
}

async function synthesizeVoiceAudio(text, options = {}) {
    logger.voice(`Sintetizando áudio TTS para: "${String(text || '').slice(0, 80)}"`);
    const cleanText = cleanForTts(text);
    if (!cleanText) return null;
    const wavBuffer = await synthesizeAudio(text, options);
    if (!wavBuffer) return null;
    const oggBuffer = await convertWavToOggOpus(wavBuffer);
    if (!oggBuffer) return null;
    logger.voice(`Áudio TTS sintetizado com sucesso (${oggBuffer.length} bytes Opus)`);
    const {durationSecs: durationSecs, waveform: waveform} = extractWaveformAndDuration(wavBuffer);
    return {
        cleanText: cleanText,
        wavBuffer: wavBuffer,
        oggBuffer: oggBuffer,
        durationSecs: durationSecs,
        waveform: waveform
    };
}

module.exports = {
    cleanForTts: cleanForTts,
    synthesizeAudio: synthesizeAudio,
    synthesizeVoiceAudio: synthesizeVoiceAudio,
    convertWavToOggOpus: convertWavToOggOpus
};
