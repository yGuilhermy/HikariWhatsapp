const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');
const { run, createMediaJob, cleanupMediaJob, inspectMedia, checkMediaSize } = require('./mediaService');
const { mediaError } = require('./mediaErrors');
const config = require('../config');

function deezerTrackId(raw) {
    const input = String(raw || '').trim();
    if (/^\d+$/.test(input)) return input;
    try {
        const url = new URL(input);
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
            /^(?:www\.)?deezer\.com$/i.test(url.hostname)) {
            return url.pathname.match(/^\/(?:[a-z]{2}\/)?track\/(\d+)\/?$/i)?.[1] || null;
        }
    } catch (_) {}
    return null;
}

async function searchDeezerTracks(query, signal) {
    try {
        const response = await axios.get('https://api.deezer.com/search', { params: { q: query }, timeout: 15000, signal });
        if (response.data?.error || !Array.isArray(response.data?.data)) throw new Error('Resposta do catálogo inválida.');
        return response.data.data.slice(0, 5).map(track => ({
            id: deezerTrackId(track.id), title: track.title, artist: track.artist?.name,
            album: track.album?.title, link: track.link
        })).filter(track => track.id && typeof track.title === 'string');
    } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error.response?.status === 429) throw mediaError('MEDIA_RATE_LIMIT', 'O Deezer limitou as buscas. Tente novamente mais tarde.');
        throw mediaError('MEDIA_UNAVAILABLE', 'O catálogo do Deezer está indisponível agora. Tente novamente mais tarde.');
    }
}

async function downloadDeezerTrack(raw, signal) {
    const id = deezerTrackId(raw);
    if (!id) throw mediaError('MEDIA_BAD_URL', 'Informe uma faixa válida do Deezer.');
    if (!process.env.DEEZER_ARL) throw mediaError('MEDIA_UNAVAILABLE', 'Os downloads do Deezer estão indisponíveis nesta instalação.');
    signal?.throwIfAborted();
    const { directory, cleanup } = createMediaJob('deezer');
    try {
        await run(config.pythonPath || (process.platform === 'win32' ? 'python' : 'python3'), [
            path.join(__dirname, 'download_deezer.py'), 'https://www.deezer.com/track/' + id, directory
        ], { signal, timeout: 120000, storage: { directory, bytes: 2 * config.maxMediaBytes } });
        const files = fs.readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && /\.(mp3|flac)$/i.test(file.name));
        if (files.length !== 1) throw mediaError('MEDIA_NO_FILE', 'O Deezer não entregou a faixa solicitada.');
        const file = path.join(directory, files[0].name);
        checkMediaSize(file);
        const info = await inspectMedia(file, signal);
        const expected = path.extname(file).slice(1).toLowerCase();
        if (info.audio?.codec_name !== expected || !info.format.includes(expected)) {
            throw mediaError('MEDIA_FORMAT', 'O Deezer retornou um formato diferente do esperado.');
        }
        signal?.throwIfAborted();
        return file;
    } catch (error) {
        cleanup();
        throw error;
    }
}

function cleanupTempAudio(file) {
    cleanupMediaJob(path.dirname(file));
}

module.exports = { deezerTrackId, searchDeezerTracks, downloadDeezerTrack, cleanupTempAudio };
