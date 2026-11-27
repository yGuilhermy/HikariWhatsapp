const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const config = require('../config');
const {run} = require('./mediaService');
const {mediaError} = require('./mediaErrors');

// Same canvas and animated duration/size limits as the reference project.
const SIZE = 512;
const ANIMATED_LIMIT = 500 * 1024;
const STATIC_LIMIT = 100 * 1024;
const DESCRIPTION_LIMIT = 128;
const MAX_ANIMATION_SECONDS = 10;
const MAX_ANIMATION_MS = MAX_ANIMATION_SECONDS * 1000;
const frames = {
    contain: { fit:'contain', background:{r:0,g:0,b:0,alpha:0},
        filter:'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0' },
    crop: { fit:'cover', position:'centre', filter:"crop='min(iw,ih)':'min(iw,ih)':exact=1,scale=512:512,format=rgba" },
    fill: { fit:'fill', filter:'scale=512:512,format=rgba' }
};

function stickerFrame(framing) {
    if (!Object.hasOwn(frames,framing)) throw new Error('Enquadramento de figurinha inválido.');
    return frames[framing];
}

function withDescription(webp, text) {
    const name = String(text || '').trim() || 'projetohikari.com';
    const description = Array.from(name).slice(0,DESCRIPTION_LIMIT).join('');
    const metadata = Buffer.from(JSON.stringify({
        'sticker-pack-id':'hikari-zap',
        'sticker-pack-name':description,
        'sticker-pack-publisher':'Hikari Bot',
        emojis:[]
    }),'utf8');
    // WhatsApp sticker metadata: TIFF with the JSON payload in tag 0x5741.
    const tiff = Buffer.from('49492a0008000000010041570700000000001a00000000000000','hex');
    tiff.writeUInt32LE(metadata.length,14);
    function chunk(name, data) {
        const header = Buffer.alloc(8);
        header.write(name,0,4,'ascii'); header.writeUInt32LE(data.length,4);
        return Buffer.concat([header,data,...(data.length%2 ? [Buffer.alloc(1)] : [])]);
    }
    const chunks = [];
    let extended = false;
    let alpha = false;
    for (let offset=12;offset+8<=webp.length;) {
        const name = webp.toString('ascii',offset,offset+4);
        const length = webp.readUInt32LE(offset+4);
        const end = offset+8+length+(length%2);
        if (end>webp.length) throw new Error('Figurinha WebP inválida.');
        const data = Buffer.from(webp.subarray(offset+8,offset+8+length));
        if (name==='VP8X') { data[0] |= 0x08; extended = true; }
        if (name==='ALPH' || (name==='VP8L' && data.length >= 5 && (data[4] & 0x10))) alpha = true;
        if (name!=='EXIF') chunks.push(chunk(name,data));
        offset=end;
    }
    if (!extended) {
        const data = Buffer.alloc(10);
        data[0] = 0x08 | (alpha ? 0x10 : 0);
        data.writeUIntLE(SIZE-1,4,3); data.writeUIntLE(SIZE-1,7,3);
        chunks.unshift(chunk('VP8X',data));
    }
    chunks.push(chunk('EXIF',Buffer.concat([tiff,metadata])));
    const body = Buffer.concat([Buffer.from('WEBP'),...chunks]);
    const header = Buffer.alloc(8);
    header.write('RIFF'); header.writeUInt32LE(body.length,4);
    return Buffer.concat([header,body]);
}
function validate(media, types) {
    if (!media || !types.includes(media.type)) throw new Error(types.includes('sticker')
        ? 'Responda a uma figurinha com >sticker2image.'
        : 'Envie ou cite uma imagem, GIF ou vídeo com >sticker.');
    if (!Buffer.isBuffer(media.buffer) || !media.buffer.length) throw new Error('Mídia vazia.');
    if (media.buffer.length > config.maxMediaBytes) throw new Error('Anexo acima do limite de mídia.');
}
async function toSticker(media, signal, description = '', framing = 'contain') {
    validate(media, ['image','video']);
    signal?.throwIfAborted();
    const frame = stickerFrame(framing);
    if (media.type === 'video') return encodeAnimated(media, signal, description, false, frame);
    const isGif = media.buffer.subarray(0,3).toString() === 'GIF';
    const isWebp = media.buffer.subarray(8,12).toString() === 'WEBP';
    if (isGif || isWebp) {
        const metadata = await sharp(media.buffer,{limitInputPixels:40000000}).metadata();
        if (metadata.pages > 1) {
            const sticker = await encodeImageAnimation(media.buffer,metadata,description,signal,frame);
            if (sticker) return sticker;
            if (isWebp) throw mediaError('STICKER_SIZE', 'Esse WebP animado excede o limite. Envie um trecho menor.');
            return encodeAnimated(media, signal, description, false, frame);
        }
    }
    for (const quality of [75,60,40,20]) {
        const encoded = await sharp(media.buffer, {limitInputPixels:40000000}).rotate()
            .resize(SIZE,SIZE,frame).webp({quality}).toBuffer();
        const buffer = withDescription(encoded,description);
        signal?.throwIfAborted();
        if (buffer.length <= STATIC_LIMIT) return buffer;
    }
    throw new Error('A figurinha ultrapassou 100 KB; tente outra imagem.');
}

async function encodeImageAnimation(buffer, metadata, description, signal, frame) {
    const {delay,format,pages,width,pageHeight=metadata.height} = metadata;
    if (!delay?.length || !pageHeight) return null;
    if (format === 'webp' && width === SIZE && pageHeight === SIZE &&
        delay.reduce((sum, ms) => sum + ms, 0) <= MAX_ANIMATION_MS) {
        const existing = withDescription(buffer,description);
        if (existing.length <= ANIMATED_LIMIT) return existing;
    }

    let duration = 0;
    const delays = [];
    for (const ms of delay) {
        const frameDuration = Math.min(ms,MAX_ANIMATION_MS-duration);
        delays.push(frameDuration);
        duration += frameDuration;
        if (duration >= MAX_ANIMATION_MS) break;
    }
    const frames = Math.min(pages,delays.length);
    const pixelBudget = 16_000_000;
    if (frames < 2 || frames * Math.max(width*pageHeight,SIZE*SIZE) > pixelBudget) return null;
    signal?.throwIfAborted();
    const encoded = await sharp(buffer,{pages:frames,limitInputPixels:pixelBudget})
        .resize(SIZE,SIZE,frame)
        .webp({quality:48,effort:1,delay:delays.slice(0,frames),loop:0}).toBuffer();
    signal?.throwIfAborted();
    const sticker = withDescription(encoded,description);
    return sticker.length <= ANIMATED_LIMIT ? sticker : null;
}

async function toSoundSticker(media, signal, name, framing = 'contain') {
    if (media?.type !== 'video') {
        throw mediaError('STICKER_SOUND_INPUT', 'Envie ou cite um vídeo com áudio usando >sticker_som [nome].');
    }
    validate(media, ['video']);
    return encodeAnimated(media, signal, name, true, stickerFrame(framing));
}

async function encodeAnimated(media, signal, description, withSound, frame) {
    signal?.throwIfAborted();
    const duration = String(MAX_ANIMATION_SECONDS);
    const formats = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm';
    const inputOptions = ['-protocol_whitelist','file,pipe','-format_whitelist',withSound ? formats : formats+',gif,webp_pipe'];
    const profiles = withSound ? [[10,39],[8,28],[6,18],[5,15]] : [[12,46],[9,32],[7,18]];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'hikari-sticker-'));
    try {
        const input = path.join(directory,'input');
        const output = path.join(directory,'sticker.webp');
        await fs.promises.writeFile(input,media.buffer);
        let useFrameEncoder = false;
        for (const [fps,quality] of profiles) {
            signal?.throwIfAborted();
            const convert = async encoder => {
                await run(config.ffmpegPath || 'ffmpeg', ['-nostdin','-hide_banner','-loglevel','error','-y',
                    '-filter_threads','1',...inputOptions,'-max_pixels','16000000','-threads','1','-t',duration,'-i',input,
                    '-vf','fps='+fps+",scale=w='iw*sar':h=ih,setsar=1,"+frame.filter+',setsar=1',
                    '-c:v',encoder,'-compression_level','1','-q:v',String(quality),'-loop','0','-an',output], {signal,timeout:30000});
                return withDescription(await fs.promises.readFile(output),description);
            };
            let sticker = await convert(useFrameEncoder ? 'libwebp' : 'libwebp_anim');
            if (sticker.length > ANIMATED_LIMIT) continue;
            if (!withSound) return sticker;

            let animationMs = await getAnimationDuration(sticker);
            if (!animationMs && !useFrameEncoder) {
                useFrameEncoder = true;
                sticker = await convert('libwebp');
                if (sticker.length > ANIMATED_LIMIT) continue;
                animationMs = await getAnimationDuration(sticker);
            }
            if (!animationMs) {
                throw mediaError('STICKER_SOUND_ANIMATION', 'Use um vídeo um pouco mais longo para criar a figurinha com som.');
            }
            const audioPath = path.join(directory,'sound.ogg');
            const waveformPath = path.join(directory,'waveform.pcm');
            const seconds = (Math.min(animationMs,MAX_ANIMATION_MS)/1000).toFixed(3);
            const audioFilter = 'aresample=48000:async=1:first_pts=0,apad';
            try {
                await run(config.ffmpegPath || 'ffmpeg', ['-nostdin','-hide_banner','-loglevel','error','-y',...inputOptions,
                    '-i',input,'-map','0:a:0','-vn','-af',audioFilter,'-t',seconds,'-ac','1','-c:a','libopus','-b:a','32k',audioPath,
                    '-map','0:a:0','-vn','-af',audioFilter,'-t',seconds,'-ac','1','-ar','4000','-f','s16le',waveformPath],
                    {signal,timeout:30000});
            } catch (error) {
                if (signal?.aborted || error.code === 'ENOENT' || (error.code && !['MEDIA_PROCESS_FAILED','MEDIA_NO_FILE'].includes(error.code))) throw error;
                throw mediaError('STICKER_SOUND_NO_AUDIO', 'Não consegui extrair o som. Confira se o vídeo tem uma faixa de áudio.');
            }
            const stickerAudio = await fs.promises.readFile(audioPath);
            if (!stickerAudio.subarray(0,64).includes('OpusHead')) {
                throw mediaError('STICKER_SOUND_NO_AUDIO', 'Não encontrei áudio utilizável nesse vídeo.');
            }
            const stickerAudioWaveform = audioWaveform(await fs.promises.readFile(waveformPath));
            return {sticker,stickerAudio,stickerAudioWaveform,stickerAudioSeconds:Math.max(1,Math.round(Number(seconds)))};
        }
        throw new Error('A figurinha animada ultrapassou 500 KB; tente um trecho mais curto ou simples.');
    } catch (error) {
        if (error.name === 'AbortError' || signal?.aborted || error.publicMessage) throw error;
        if (error.code === 'ENOENT') throw new Error('Configure o FFmpeg para criar figurinhas de GIFs e vídeos.');
        throw new Error(`Não foi possível criar a figurinha animada. ${error.message}`);
    } finally { fs.rmSync(directory,{recursive:true,force:true}); }
}
async function getAnimationDuration(sticker) {
    const {delay,pages} = await sharp(sticker,{animated:true}).metadata();
    if (!(pages > 1)) return 0;
    return delay?.reduce((total, frame) => total + frame, 0) || 0;
}

function audioWaveform(pcm) {
    const peaks = new Uint16Array(64);
    const samples = Math.floor(pcm.length/2);
    for (let i=0; i<samples; i++) {
        const bucket = Math.floor(i*peaks.length/samples);
        peaks[bucket] = Math.max(peaks[bucket],Math.abs(pcm.readInt16LE(i*2)));
    }
    const maximum = Math.max(1,...peaks);
    return Buffer.from(Array.from(peaks, peak => Math.round(100*peak/maximum)));
}

async function stickerToImage(media, signal) {
    validate(media,['sticker']);
    signal?.throwIfAborted();
    const metadata = await sharp(media.buffer,{limitInputPixels:40000000}).metadata();
    const animated = metadata.pages > 1;
    const pipeline = sharp(media.buffer,{animated,limitInputPixels:40000000})
        .flatten({background:'#ffffff'});
    const buffer = await (animated ? pipeline.gif({loop:0,effort:2,keepDuplicateFrames:true}) : pipeline.png()).toBuffer();
    signal?.throwIfAborted();
    if (buffer.length > config.maxMediaBytes) throw new Error('Imagem acima do limite de envio.');
    return buffer;
}
module.exports = {toSticker,toSoundSticker,stickerToImage};
