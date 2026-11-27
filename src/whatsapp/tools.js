const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const schemas = require('../data/mcp_tools.json');
const {logger} = require('../utils/logger');
const {mediaError} = require('../services/mediaErrors');
const {checkMediaSize} = require('../services/mediaService');

function validate(name, args) {
    const schema = schemas.find(x => x.function.name === name)?.function.parameters;
    if (!schema) throw new Error('Ferramenta indisponível.');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Argumentos inválidos.');
    for (const key of schema.required || []) if (args[key] === undefined || typeof args[key] === 'string' && !args[key].trim()) throw new Error(`Falta o argumento ${key}.`);
    for (const [key,value] of Object.entries(args)) {
        const rule = schema.properties[key];
        if (!rule) throw new Error(`Argumento não permitido: ${key}.`);
        if (rule.type === 'string' && (typeof value !== 'string' || value.length > 4000)) throw new Error(`Texto inválido: ${key}.`);
        if (['number','integer'].includes(rule.type) && (typeof value !== 'number' || !Number.isFinite(value) || (rule.type === 'integer' && !Number.isInteger(value)))) throw new Error(`Número inválido: ${key}.`);
        if (rule.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Valor inválido: ${key}.`);
        if (rule.enum && !rule.enum.includes(value)) throw new Error(`Valor inválido: ${key}.`);
        if (rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined && value > rule.maximum) throw new Error(`Valor fora do limite: ${key}.`);
    }
}

function musicText(value, max = 130) {
    return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function normalizedTrack(value) {
    return musicText(value, 4000).toLocaleLowerCase('pt-BR').normalize('NFD')
        .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

async function sendMedia(ctx, file, payload) {
    ctx.signal?.throwIfAborted();
    const size = fs.statSync(file).size;
    if (!size) throw mediaError('MEDIA_FORMAT', 'O arquivo retornado está vazio.');
    if (size > config.maxMediaBytes) throw mediaError('MEDIA_TOO_LARGE', 'O arquivo excede o limite de envio. Tente uma mídia menor.');
    try { await ctx.send(payload); }
    catch (error) {
        if (ctx.signal?.aborted) throw ctx.signal.reason;
        if (error.silent) throw error;
        logger.warn('Falha ao enviar mídia já preparada: ' + error.message);
        throw mediaError('MEDIA_UPLOAD_FAILED', 'Preparei o arquivo, mas não consegui enviá-lo. Tente novamente.');
    }
    ctx.mediaSent = true;
    if (payload.audio) ctx.audioSent = true;
}

async function publishSelection(ctx, tool, text, remember) {
    if (ctx.deferSelection) ctx.deferSelection(tool, text, remember);
    else remember(await ctx.send({text}));
    ctx.toolReplySent = true;
}

function createToolExecutor(overrides = {}) {
    const service = {
        search: (...a) => require('../handlers/searchManager').searchWeb(...a),
        steam: (...a) => require('../handlers/steamHandler').getSteamGameInfo(...a),
        currency: (...a) => require('../handlers/currencyHandler').convertCurrency(...a),
        searchGames: (...a) => require('../services/torrentService').searchGames(...a),
        torrentFile: (...a) => require('../services/torrentService').getTorrentOrMagnet(...a),
        image: (...a) => require('../handlers/imageHandler').generateImage(...a),
        soundSticker: (...a) => require('../services/stickerService').toSoundSticker(...a),
        sticker: (...a) => require('../services/stickerService').toSticker(...a),
        voice: (...a) => require('../services/ttsService').synthesizeVoiceAudio(...a),
        download: (...a) => require('../services/mediaService').download(...a),
        anime: (...a) => require('../handlers/sauceHandler').getAnimeSource(...a),
        ...overrides
    };
    const torrentSelections = new Map();
    const musicSelections = new Map();
    let selectionSequence = 0;
    async function execute(name, args, ctx) {
        ctx.signal?.throwIfAborted();
        validate(name,args);
        if (ctx.onToolStart) await ctx.onToolStart(name);
        ctx.signal?.throwIfAborted();
        logger.event('tool', 'tool', `Iniciando execução da ferramenta "${name}" | args: ${JSON.stringify(args)}`);
        if (name === 'create_sticker' || name === 'create_sound_sticker') {
            const withSound = name === 'create_sound_sticker';
            if (withSound && !config.soundStickersEnabled) return {error:'Figurinhas com som estão desativadas nesta instância.'};
            if (ctx.stickerUrl && config.capabilities?.download === false) {
                throw mediaError('MEDIA_UNAVAILABLE','O download por link está desativado. Anexe o vídeo para criar a figurinha.');
            }
            if (ctx.requestedStickerTool) await ctx.notifyStickerProgress?.(ctx.signal);
            const download = ctx.stickerUrl ? await service.download(ctx.stickerUrl,'video',ctx.signal) : null;
            try {
                let media;
                if (download) {
                    checkMediaSize(download.filePath);
                    const buffer = await fs.promises.readFile(download.filePath,{signal:ctx.signal});
                    media = {buffer,type:'video',mimetype:'video/mp4'};
                } else {
                    media = await ctx.getMedia();
                }
                ctx.signal?.throwIfAborted();
                const payload = withSound
                    ? await service.soundSticker(media,ctx.signal,args.name || '',args.framing)
                    : {sticker:await service.sticker(media,ctx.signal,args.description || '',args.framing)};
                ctx.signal?.throwIfAborted();
                await ctx.send(payload);
                ctx.mediaSent = true;
                return {ok:true,message:withSound ? 'Figurinha com som enviada.' : 'Figurinha enviada.'};
            } finally { download?.cleanup(); }
        }
        const selectionKey = JSON.stringify([ctx.chatId,ctx.senderId]);
        if (name === 'search_game') {
            const games = await service.searchGames(args.game_name,ctx.signal);
            ctx.signal?.throwIfAborted();
            for (const [key,value] of torrentSelections) if(Date.now()-value.at>600000)torrentSelections.delete(key);
            if(!games.length)return {error:'Nenhum torrent encontrado no catálogo local. Tente o nome completo do jogo.'};
            const items=games.slice(0,5);
            const line = value => String(value).replace(/[\r\n\t]/g,' ').slice(0,130);
            await publishSelection(ctx,name,items.map((game,i)=>`${i+1}. ${line(game.title)} — ${line(game.provider)}${game.fileSize ? ` · ${line(game.fileSize)}` : ''}`).join('\n')+`\n\nResponda esta lista com um número ou use ${config.prefix || '>'}torrent 1–${items.length}. Sem resposta direta, vale sua última busca nesta conversa. Validade: 10 minutos.`,sent => {
                if(torrentSelections.size>=100)torrentSelections.delete(torrentSelections.keys().next().value);
                torrentSelections.set(++selectionSequence,{scope:selectionKey,messageId:sent?.key?.id,at:Date.now(),items});
            });
            return {ok:true,message:'Resultados enviados; aguarde a escolha do usuário.'};
        }
        if (name === 'download_game_torrent') {
            const selection=[...torrentSelections.values()].reverse().find(value=>value.scope===selectionKey && (!ctx.quotedMessageId || value.messageId===ctx.quotedMessageId));
            if(!selection || Date.now()-selection.at>600000) {
                throw new Error(`Faça uma busca com ${config.prefix || '>'}torrent nome; a seleção expirou ou não existe para você nesta conversa. Se respondeu uma mensagem, responda à lista correta.`);
            }
            const game=selection.items[args.result_index-1];
            if(!game)throw new Error(`Escolha um número de 1 a ${selection.items.length}.`);
            const result=await service.torrentFile(game,ctx.signal);
            ctx.signal?.throwIfAborted();
            if(result.buffer.length>config.maxMediaBytes)throw new Error('Arquivo acima do limite de envio.');
            await ctx.send({document:result.buffer,fileName:result.fileName,mimetype:result.mimetype,
                caption:`${String(game.title).replace(/[\r\n]/g,' ').slice(0,140)} · ${game.provider}${result.fallback ? '\n.torrent indisponível; magnet no arquivo de texto.' : ''}`});
            ctx.mediaSent=true;
            return {ok:true,message:'Arquivo enviado.'};
        }
        const capability={download_audio:'download',download_video:'download',send_voice_note:'voice',search_and_download_music:'deezer'}[name];
        if (capability && config.capabilities?.[capability] === false) {
            const message = 'Esta função não está configurada nesta instalação.';
            if (capability === 'download' || capability === 'deezer') throw mediaError('MEDIA_UNAVAILABLE', message);
            throw new Error(message);
        }
        if (name === 'search_web') return service.search(args.query,ctx.signal);
        if (name === 'check_steam') return service.steam(args.game,ctx.signal);
        if (name === 'convert_currency') return service.currency(args.amount,args.from,args.to || 'BRL',ctx.signal);
        if (name === 'generate_image') {
            const result = await service.image(args.prompt,args.negative_prompt || '',args.width || 1024,args.height || 1024);
            if (!result) throw new Error('Não foi possível gerar a imagem.');
            try {
                ctx.signal?.throwIfAborted();
                const buffer = result.localFilePath ? fs.readFileSync(result.localFilePath) : Buffer.from((await require('../utils/network').safeGet(result.imageUrl,{responseType:'arraybuffer',signal:ctx.signal})).data);
                const caption = (ctx.mediaCaption && !/\b(gerando|aguard|criando)\b/i.test(ctx.mediaCaption)) ? ctx.mediaCaption : (args.prompt || 'Imagem gerada pela Hikari.');
                await ctx.send({image:buffer,caption});
                ctx.mediaSent = true;
            } finally { if (result.localFilePath) fs.rmSync(result.localFilePath,{force:true}); }
            return {ok:true,message:'Imagem enviada.'};
        }
        if (name === 'send_voice_note') {
            if (!args.text.trim() || args.text.length > config.voiceMaxChars) throw new Error(`Use de 1 a ${config.voiceMaxChars} caracteres por áudio.`);
            const result = await service.voice(args.text);
            ctx.signal?.throwIfAborted();
            if (!result?.oggBuffer) throw new Error('TTS indisponível; confira os endpoints de voz.');
            await ctx.send({audio:result.oggBuffer,mimetype:'audio/ogg; codecs=opus',ptt:true});
            ctx.audioSent = true;
            ctx.mediaSent = true;
            return {ok:true,message:'Mensagem de voz enviada.'};
        }
        if (['download_audio','download_video'].includes(name)) {
            const type = name === 'download_audio' ? 'audio' : 'video';
            const result = await service.download(args.url, type, ctx.signal);
            try {
                const media = { url: result.filePath };
                if (type === 'audio') {
                    await sendMedia(ctx, result.filePath, { audio: media, mimetype: 'audio/mpeg', ptt: false });
                } else {
                    const title = musicText(path.parse(result.fileName || result.filePath).name.replace(/_/g, ' '), 160);
                    await sendMedia(ctx, result.filePath, { video: media, mimetype: 'video/mp4', ...(title ? { caption: title } : {}) });
                }
            } finally { result.cleanup(); }
            return { ok: true, message: 'Arquivo enviado.' };
        }
        if (name === 'search_and_download_music') {
            const deezer = require('../services/deezerMusicService');
            const expiry = 10 * 60 * 1000;
            const now = Date.now();
            for (const [key, selection] of musicSelections) {
                if (selection.at + expiry <= now) musicSelections.delete(key);
            }

            const query = args.query.trim();
            const choice = query.match(/^#([1-5])$/);
            let track;
            if (choice) {
                const selection = musicSelections.get(selectionKey);
                if (!selection || (ctx.quotedMessageId && selection.messageId !== ctx.quotedMessageId)) {
                    throw mediaError('MEDIA_SELECTION_EXPIRED', 'Essa lista de músicas expirou ou não é a sua. Faça a busca novamente.');
                }
                track = selection.tracks[Number(choice[1]) - 1];
                if (!track) throw mediaError('MEDIA_SELECTION_INVALID', 'Escolha um número que aparece na lista de músicas.');
                musicSelections.delete(selectionKey);
            } else {
                const linked = /^https:\/\//i.test(query) && deezer.deezerTrackId?.(query);
                if (linked) {
                    track = { id: linked, title: 'Faixa Deezer' };
                } else {
                    const tracks = await deezer.searchDeezerTracks(query, ctx.signal);
                    ctx.signal?.throwIfAborted();
                    if (!tracks.length) return { error: 'Música não encontrada no Deezer.' };
                    const requested = normalizedTrack(query);
                    const exact = tracks.filter(item => [item.title, item.title + ' ' + (item.artist || ''),
                        (item.artist || '') + ' ' + item.title].some(value => normalizedTrack(value) === requested));
                    if (exact.length === 1) track = exact[0];
                    else {
                        const queryWords = new Set(requested.split(' ').filter(word => word.length >= 3));
                        const options = exact.length ? exact : tracks.filter(item =>
                            normalizedTrack(item.title + ' ' + (item.artist || '')).split(' ').some(word => queryWords.has(word)));
                        if (!options.length) return {error:'Não encontrei uma faixa compatível no Deezer. Informe o título ou o artista.'};
                        const lines = options.map((item, index) => (index + 1) + '. ' + musicText(item.title) +
                            ' — ' + musicText(item.artist || 'Artista desconhecido') +
                            (item.album ? ' (' + musicText(item.album, 80) + ')' : ''));
                        const prefix = config.prefix || '>';
                        const range = options.length === 1 ? '#1' : '#1 a #' + options.length;
                        const text = lines.join('\n') + '\n\nResponda com o número ou use ' + prefix + 'musica ' + range +
                            '. Lista válida por 10 minutos.';
                        await publishSelection(ctx,name,text,sent => {
                            if (musicSelections.size >= 100) musicSelections.delete(musicSelections.keys().next().value);
                            musicSelections.set(selectionKey, {tracks:options, at:Date.now(), messageId:sent?.key?.id});
                        });
                        return { ok: true, awaitingSelection: true, message: 'Lista enviada. Aguarde a escolha do usuário.' };
                    }
                }
            }

            const file = await deezer.downloadDeezerTrack(String(track.id), ctx.signal);
            try {
                const media = { url: file };
                if (path.extname(file).toLowerCase() === '.flac') {
                    const title = musicText(track.title, 100).replace(/[\\/]/g, '_') || 'Faixa Deezer';
                    await sendMedia(ctx, file, { document: media, mimetype: 'audio/flac', fileName: title + '.flac' });
                } else await sendMedia(ctx, file, { audio: media, mimetype: 'audio/mpeg', ptt: false });
            } finally { deezer.cleanupTempAudio(file); }
            return { ok: true, title: track.title, artist: track.artist };
        }
        if (name === 'anime_source') {
            let media;
            if (args.url) {
                const response = await require('../utils/network').safeGet(args.url,{responseType:'arraybuffer',signal:ctx.signal,maxContentLength:10*1024*1024});
                media = {buffer:Buffer.from(response.data),mimetype:response.headers['content-type']?.split(';')[0] || 'image/jpeg'};
            } else media = await ctx.getMedia();
            if (!media || media.type && media.type !== 'image' || !media.mimetype.startsWith('image/')) throw new Error('Anexe ou cite uma imagem com '+(config.prefix || '>')+'anime.');
            return service.anime(media.buffer,media.mimetype,ctx.signal);
        }
        throw new Error('Ferramenta indisponível.');
    }
    execute.resolveQuotedMusic = (message) => {
        if (!message.isReplyToBot || !message.quotedMessageId) return null;
        const selection = musicSelections.get(JSON.stringify([message.chatId,message.senderId]));
        if (!selection || selection.messageId !== message.quotedMessageId || Date.now() - selection.at >= 600000) return null;
        const choice = normalizedTrack(message.text).replace(/ (?:por favor|pfv|pf)$/u,'');
        const selectionPrefix = /^(?:(?:manda|mande|envia|envie|baixa|baixe|quero|escolho|pega|pegar|e)\s+)?(?:(?:a|o|numero|faixa|opcao)\s+)*/u;
        const selectionText = choice.replace(selectionPrefix, '');
        const ordinal = /^(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa])(?:\s+(.+))?$/u.exec(selectionText);
        const numeric = /^([1-5])(?:\s+(.+))?$/u.exec(selectionText);
        const index = numeric ? Number(numeric[1]) - 1 :
            ['primeiro','segundo','terceiro','quarto','quinto'].indexOf(ordinal?.[1].replace(/a$/,'o'));
        if (index >= 0) {
            const track = selection.tracks[index];
            const title = (numeric?.[2] || ordinal?.[2] || '').replace(/^(?:musica|faixa|opcao)(?: |$)/u,'');
            const hasTorrentMenu = [...torrentSelections.values()].some(item =>
                item.scope === JSON.stringify([message.chatId,message.senderId]) && item.messageId === message.quotedMessageId);
            if (hasTorrentMenu && !title) return 'ambiguous';
            if (!track || (title && !normalizedTrack(track.title + ' ' + (track.artist || '')).includes(title))) return null;
            return '#' + (index + 1);
        }
        const matched = selection.tracks.map((track,i) => [track,i]).filter(([track]) =>
            [track.title, track.title + ' ' + (track.artist || '')].some(term => normalizedTrack(term) === choice));
        return matched.length === 1 ? '#' + (matched[0][1] + 1) : null;
    };
    return execute;
}

module.exports = { createToolExecutor, validate };
