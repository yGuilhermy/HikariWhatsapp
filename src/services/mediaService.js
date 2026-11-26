const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const config = require('../config');
const { logger } = require('../utils/logger');
const { mediaError, classifyProviderError } = require('./mediaErrors');

const mediaRoot = path.join(config.dataDir || path.join(os.tmpdir(), 'hikari-zap-local'), 'media-jobs');
const jobExpiry = 6 * 60 * 60 * 1000;
const activeJobs = new Set();
let lastSweep = 0;

function createMediaJob(prefix) {
    fs.mkdirSync(mediaRoot, { recursive: true, mode: 0o700 });
    if (!fs.lstatSync(mediaRoot).isDirectory()) throw mediaError('MEDIA_UNAVAILABLE', 'A pasta temporária de downloads não está disponível.');
    const now = Date.now();
    if (now - lastSweep >= jobExpiry) {
        lastSweep = now;
        for (const entry of fs.readdirSync(mediaRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^(download|deezer)-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
            const candidate = path.join(mediaRoot, entry.name);
            if (activeJobs.has(candidate)) continue;
            try {
                if (now - fs.lstatSync(candidate).mtimeMs >= jobExpiry) fs.rmSync(candidate, { recursive: true, force: true });
            } catch (error) {
                logger.warn('Não foi possível limpar uma pasta temporária de mídia: ' + error.code);
            }
        }
    }

    const directory = fs.mkdtempSync(path.join(mediaRoot, prefix + '-'));
    activeJobs.add(directory);
    return { directory, cleanup: () => cleanupMediaJob(directory) };
}

function cleanupMediaJob(directory) {
    if (!activeJobs.delete(directory)) return;
    try { fs.rmSync(directory, { recursive: true, force: true }); }
    catch (error) { logger.warn('Não foi possível limpar a mídia temporária: ' + error.code); }
}

function run(command, args, { signal, timeout = 120000, maxOutput = 1048576, storage } = {}) {
    return new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const detached = process.platform !== 'win32';
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], detached, windowsHide: true });
        let stdout = '', stderr = '', stopping;
        const stop = error => {
            if (stopping) return;
            stopping = error;
            if (detached && child.pid) {
                try { process.kill(-child.pid, 'SIGKILL'); return; } catch (_) {}
            } else if (!detached && child.pid) {
                const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
                taskkill.once('error', () => child.kill('SIGKILL'));
                taskkill.once('close', code => { if (code !== 0) child.kill('SIGKILL'); });
                return;
            }
            child.kill('SIGKILL');
        };
        const onAbort = () => stop(signal.reason);
        const timer = setTimeout(() => stop(mediaError('MEDIA_TIMEOUT', 'O tempo para preparar a mídia se esgotou. Tente um arquivo menor.')), timeout);
        const guard = storage && setInterval(() => {
            try {
                let bytes = 0;
                for (const entry of fs.readdirSync(storage.directory, { withFileTypes: true })) {
                    if (entry.isFile()) bytes += fs.lstatSync(path.join(storage.directory, entry.name)).size;
                }
                if (bytes > storage.bytes) stop(mediaError('MEDIA_TOO_LARGE', 'O arquivo excede o limite de processamento. Tente uma mídia menor.'));
            } catch (error) {
                if (error.code !== 'ENOENT') stop(error);
            }
        }, 200);
        function release() {
            clearTimeout(timer);
            clearInterval(guard);
            signal?.removeEventListener('abort', onAbort);
        }
        child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-maxOutput); });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
        child.once('error', error => {
            release();
            reject(stopping || (error.code === 'ENOENT'
                ? mediaError('MEDIA_UNAVAILABLE', 'O serviço de mídia está indisponível nesta instalação.')
                : error));
        });
        child.once('close', code => {
            release();
            if (stopping) return reject(stopping);
            if (code !== 0) {
                logger.warn('Processamento de mídia falhou (' + code + '): ' + stderr.trim());
                return reject(classifyProviderError(stderr, code));
            }
            resolve({ stdout, stderr });
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}

function matchesHost(host, base) {
    return host === base || host.endsWith('.' + base);
}

function normalizeMediaUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 8192) return null;
    const text = raw.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/gu, '');
    const links = text.match(/https?:\/\/[^\s<>"'`]+|(?<![\w@./-])(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/[^\s<>"'`]+/giu);
    if (links?.length !== 1) return null;
    const token = links[0];
    let value = token.replace(/[)\]}>.,;!?*~]+$/u, '').replaceAll('&amp;', '&');
    if (text[text.indexOf(token)-1] === '_' && value.endsWith('_')) value = value.slice(0,-1);
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try {
        const url = new URL(value);
        const host = url.hostname;
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
        url.hash = '';
        if (matchesHost(host, 'instagram.com') || matchesHost(host, 'instagr.am')) {
            const post = url.pathname.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)\/?$/i);
            const share = url.pathname.match(/^\/share\/(?:(reels?|p)\/)?([\w-]+)\/?$/i);
            if (!post && !share) return null;
            const [kind,code] = (post || share).slice(1);
            const route = kind?.toLowerCase() === 'reels' ? 'reel' : kind?.toLowerCase();
            const mediaPath = [share ? 'share' : '', route, code].filter(Boolean).join('/');
            return 'https://www.instagram.com/' + mediaPath + '/';
        } else if (matchesHost(host, 'youtube.com')) {
            if (url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') || '')) {
                if (host === 'music.youtube.com') url.hostname = 'www.youtube.com';
            } else if (!/^\/(?:shorts|live|embed|v)\/[\w-]{11}\/?$/.test(url.pathname)) return null;
        } else if (host === 'youtu.be') {
            if (!/^\/[\w-]{11}\/?$/.test(url.pathname)) return null;
        } else if (matchesHost(host, 'tiktok.com')) {
            if (!/^\/(?:@[\w.-]+\/(?:video|photo)\/\d+|t\/[\w-]+|v\/\d+|[\w.-]+)\/?$/.test(url.pathname)) return null;
        } else if (['twitter.com', 'x.com', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'].some(base => matchesHost(host, base))) {
            const match = url.pathname.match(/^\/(?:[\w]+\/status|i\/status|i\/web\/status)\/(\d+)(?:\/(?:video|photo)\/\d+)?\/?$/);
            if (!match) return null;
            return 'https://x.com/i/status/' + match[1];
        } else return null;
        return url.href.length <= 2048 ? url.href : null;
    } catch { return null; }
}

function supportedUrl(raw) { return normalizeMediaUrl(raw) !== null; }

function hasCookieForHost(cookiePath, host, requiredName) {
    try {
        if (!cookiePath || !fs.existsSync(cookiePath)) return false;
        const base = host === 'youtu.be' ? 'youtube.com' : host;
        return fs.readFileSync(cookiePath, 'utf8').split(/\r?\n/).some(row => {
            const [rawDomain, , , , expires, name, value] = row.replace(/^#HttpOnly_/, '').split('\t');
            const domain = rawDomain.replace(/^\./, '').toLowerCase();
            return domain && (matchesHost(base, domain) || matchesHost(domain, base)) &&
                (!requiredName || (name === requiredName && value && (expires === '0' || Number(expires)*1000 > Date.now())));
        });
    } catch { return false; }
}

async function inspectMedia(filePath, signal) {
    try {
        const result = await run(config.ffprobePath || 'ffprobe', ['-v', 'error', '-show_entries',
            'format=format_name,duration:format_tags=major_brand:stream=codec_type,codec_name,pix_fmt,width,height,duration',
            '-of', 'json', filePath], { signal, timeout: 15000 });
        const { streams = [], format = {} } = JSON.parse(result.stdout);
        return {
            video: streams.find(stream => stream.codec_type === 'video'),
            audio: streams.find(stream => stream.codec_type === 'audio'),
            format: format.format_name?.split(',') || [],
            majorBrand: format.tags?.major_brand?.trim() || '',
            duration: Number(format.duration || 0),
            videoDuration: Number(streams.find(stream => stream.codec_type === 'video')?.duration || format.duration || 0)
        };
    } catch (error) {
        if (signal?.aborted || error.code === 'MEDIA_UNAVAILABLE' || error.code === 'MEDIA_TIMEOUT') throw error;
        throw mediaError('MEDIA_FORMAT', 'Não consegui identificar o formato do arquivo baixado.');
    }
}

function checkMediaSize(file) {
    const size = fs.statSync(file).size;
    if (!size) throw mediaError('MEDIA_FORMAT', 'O provedor retornou um arquivo vazio.');
    if (size > config.maxMediaBytes) throw mediaError('MEDIA_TOO_LARGE', 'O arquivo excede o limite de envio. Tente uma mídia menor.');
}

function completedFile(directory, stdout, type) {
    const extensions = type === 'audio' ? /\.(?:mp3|m4a|aac|ogg|opus|wav|flac|webm|mp4)$/i : /\.(?:mp4|webm|mkv|mov|m4v|ts)$/i;
    const results = stdout.trim().split('\n').map(name => path.resolve(name.trim()));
    const reported = results.find(file => path.dirname(file) === directory && extensions.test(file) && fs.existsSync(file) && fs.lstatSync(file).isFile());
    if (reported) return reported;
    const files = fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && extensions.test(entry.name));
    if (files.length === 1) return path.join(directory, files[0].name);
    if (/exceeds|max.filesize|file is larger/i.test(stdout)) {
        throw mediaError('MEDIA_TOO_LARGE', 'O arquivo excede o limite de envio. Tente uma mídia menor.');
    }
    throw mediaError('MEDIA_NO_FILE', 'O provedor não retornou uma mídia disponível.');
}

async function convert(filePath, output, type, info, { signal, storage, forceSize = false }) {
    const ffmpeg = config.ffmpegPath || 'ffmpeg';
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', filePath];
    const oversized = forceSize || fs.statSync(filePath).size > config.maxMediaBytes;
    const duration = Math.max(info.duration, type === 'video' ? info.videoDuration : 0);
    const budget = duration > 0 ? Math.floor(config.maxMediaBytes * 0.9 * 8 / duration / 1000) : 0;
    const audioRate = oversized ? Math.min(type === 'audio' ? 128 : 96, Math.max(32, Math.floor(budget / (type === 'audio' ? 1 : 5)))) : 128;
    if (oversized && (!budget || budget < (type === 'video' ? 100 : 32))) {
        throw mediaError('MEDIA_TOO_LARGE', 'A duração da mídia não permite compactação dentro do limite de envio.');
    }

    if (type === 'audio') {
        args.push('-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-b:a', audioRate + 'k');
    } else {
        args.push('-map', '0:v:0', '-map', '0:a:0?', '-vf',
            'scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2',
            '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
        if (oversized) {
            const videoRate = budget - (info.audio ? audioRate : 0);
            args.push('-b:v', videoRate + 'k', '-maxrate', videoRate + 'k', '-bufsize', 2 * videoRate + 'k');
        } else args.push('-crf', '23');
        args.push('-c:a', 'aac', '-b:a', audioRate + 'k', '-movflags', '+faststart');
    }
    try { await run(ffmpeg, [...args, output], { signal, storage }); }
    catch (error) {
        if (signal?.aborted || ['MEDIA_TOO_LARGE', 'MEDIA_TIMEOUT', 'MEDIA_UNAVAILABLE'].includes(error.code)) throw error;
        throw mediaError('MEDIA_FORMAT', 'Não consegui converter a mídia para um formato compatível.');
    }
    checkMediaSize(output);
}

function compatible(type, info, filePath) {
    return type === 'audio'
        ? info.audio?.codec_name === 'mp3' && info.format.includes('mp3')
        : info.video?.codec_name === 'h264' && info.video.pix_fmt === 'yuv420p' &&
            (!info.audio || info.audio.codec_name === 'aac') && info.format.includes('mp4') &&
            /^(?:isom|iso[2-9]|mp4[12]|avc1|dash|msnv|m4v)$/i.test(info.majorBrand) &&
            path.extname(filePath).toLowerCase() === '.mp4';
}

const instagramCooldown = new Map();
const INSTAGRAM_COOLDOWN_MS = 90000;

async function download(rawUrl, type, signal) {
    const url = normalizeMediaUrl(rawUrl);
    if (!url) throw mediaError('MEDIA_BAD_URL', 'Envie um link de publicação ou vídeo do YouTube, Instagram, TikTok ou X.');
    if (!['audio', 'video'].includes(type)) throw mediaError('MEDIA_FORMAT', 'Tipo de mídia desconhecido.');
    signal?.throwIfAborted();
    const host = new URL(url).hostname;
    const instagram = host === 'www.instagram.com';
    const cookies = hasCookieForHost(config.ytdlpCookiesPath, host, instagram ? 'sessionid' : undefined);
    if (instagram && (instagramCooldown.get(cookies)?.until || 0) > Date.now()) {
        throw instagramCooldown.get(cookies).error;
    }
    const { directory, cleanup } = createMediaJob('download');
    const storage = { directory, bytes: 3 * config.maxMediaBytes };
    try {
        const args = ['--ignore-config', '--no-playlist', '--no-exec', '--no-write-thumbnail',
            '--max-filesize', String(config.maxMediaBytes * 2), '--socket-timeout', '20',
            '--retries', '2', '--fragment-retries', '2', '--restrict-filenames',
            '--js-runtimes', 'node', '--print', 'after_move:filepath', '-o', path.join(directory, '%(title).80s.%(ext)s')];
        if (config.ffmpegPath && /[/\\]/.test(config.ffmpegPath)) args.push('--ffmpeg-location', config.ffmpegPath);
        if (cookies) args.push('--cookies', config.ytdlpCookiesPath);
        const formats = type === 'audio'
            ? ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3']
            : ['-f', 'bestvideo[height<=1080][ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4][vcodec^=avc]/best[height<=1080][ext=mp4]/bestvideo[height<=1080]+bestaudio/best', '--merge-output-format', 'mp4'];
        const fetch = async formatArgs => {
            const result = await run(config.ytdlpPath || 'yt-dlp', [...args, ...formatArgs, '--', url], { signal, storage });
            return completedFile(directory, result.stdout + '\n' + result.stderr, type);
        };
        let filePath;
        try { filePath = await fetch(formats); }
        catch (error) {
            if (type !== 'video' || error.code !== 'MEDIA_TOO_LARGE') throw error;
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                if (entry.isFile()) fs.unlinkSync(path.join(directory, entry.name));
            }
            signal?.throwIfAborted();
            filePath = await fetch(['-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]', '--merge-output-format', 'mp4']);
        }
        const originalName = path.parse(filePath).name;
        const info = await inspectMedia(filePath, signal);
        if (!(type === 'video' ? info.video : info.audio)) throw mediaError('MEDIA_FORMAT', 'A mídia recebida não contém a faixa solicitada.');
        const sourceOversized = fs.statSync(filePath).size > config.maxMediaBytes;
        if (!compatible(type, info, filePath) || sourceOversized) {
            const output = path.join(directory, type === 'audio' ? 'compatible.mp3' : 'compatible.mp4');
            try { await convert(filePath, output, type, info, { signal, storage }); }
            catch (error) {
                if (sourceOversized || error.code !== 'MEDIA_TOO_LARGE') throw error;
                fs.rmSync(output, { force: true });
                await convert(filePath, output, type, info, { signal, storage, forceSize: true });
            }
            const converted = await inspectMedia(output, signal);
            if (!compatible(type, converted, output)) {
                throw mediaError('MEDIA_FORMAT', 'O arquivo convertido não ficou em um formato compatível.');
            }
            filePath = output;
        }
        checkMediaSize(filePath);
        signal?.throwIfAborted();
        return { filePath, fileName: originalName + (type === 'audio' ? '.mp3' : '.mp4'), cleanup };
    } catch (error) {
        cleanup();
        if (instagram && (error.code === 'MEDIA_ANONYMOUS_LIMIT' || error.code === 'MEDIA_RATE_LIMIT')) {
            const failure = !cookies
                ? mediaError('MEDIA_IG_LOGIN_REQUIRED', 'O Instagram limitou o acesso desta instância. Tente mais tarde ou envie o vídeo diretamente no chat.')
                : error;
            instagramCooldown.set(cookies,{until:Date.now()+INSTAGRAM_COOLDOWN_MS,error:failure});
            throw failure;
        }
        throw error;
    }
}

async function toWav(buffer, signal) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hikari-stt-'));
    try {
        const input = path.join(directory, 'input');
        const output = path.join(directory, 'audio.wav');
        fs.writeFileSync(input, buffer);
        await run(config.ffmpegPath || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input,
            '-t', '60', '-ar', '16000', '-ac', '1', output], { signal, timeout: 20000 });
        return fs.readFileSync(output);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { run, supportedUrl, normalizeMediaUrl, download, toWav, createMediaJob, cleanupMediaJob, inspectMedia, checkMediaSize };
