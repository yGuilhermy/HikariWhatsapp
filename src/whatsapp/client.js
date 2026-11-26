const fs = require('node:fs');
const {AsyncLocalStorage} = require('node:async_hooks');
const path = require('node:path');
const config = require('../config');
const {Store} = require('./store');
const {Inbox} = require('./inbox');
const {openAuthState} = require('./authState');
const {createRouter} = require('./router');
const {logger} = require('../utils/logger');
const {acquireSessionLock,createSendLimiter} = require('./runtime');

const {userJid,chatJid,isPhoneJid,IdentityMap} = require('./jid');
function createSentMessageCache(sameUser, {limit=256,maxAgeMs=30*60_000,now=Date.now} = {}) {
    const messages = new Map();
    return {
        remember(sent) {
            const {key,message} = sent || {};
            if (!key?.id || !key.remoteJid || !message) return;
            messages.delete(key.id);
            messages.set(key.id,{jid:key.remoteJid,message,expiresAt:now()+maxAgeMs});
            if (messages.size > limit) messages.delete(messages.keys().next().value);
        },
        get({id,remoteJid}) {
            const record = messages.get(id);
            if (!record) return;
            if (now() >= record.expiresAt) {
                messages.delete(id);
                return;
            }
            if (record.jid === remoteJid || sameUser(record.jid,remoteJid)) return record.message;
        }
    };
}

function releaseInitialBuffer(events, isActive, onRelease) {
    if (!isActive() || !events.isBuffering()) return false;
    events.flush();
    onRelease();
    return true;
}

function isRecentIncoming(type, raw, now = Date.now()) {
    if (type === 'notify') return true;
    if (type !== 'append') return false;
    const timestamp = Number(raw.messageTimestamp) * 1000;
    return Number.isFinite(timestamp) && timestamp >= now - 120000 && timestamp <= now + 15000;
}
function normalizeIncoming(raw, normalizeMessageContent, {botJids = [], sentMessageKeys, identities} = {}) {
    const jid = raw.key?.remoteJid;
    if (!chatJid(jid) || raw.key?.fromMe || !raw.message) return null;
    const isGroup = jid.endsWith('@g.us');
    const content = normalizeMessageContent(raw.message) || {};
    if (content.protocolMessage || content.reactionMessage ||
        !['conversation','extendedTextMessage','imageMessage','videoMessage','audioMessage','stickerMessage'].some(type=>content[type])) return null;
    const textNode = content.extendedTextMessage || content.imageMessage || content.videoMessage || content.audioMessage || content.stickerMessage || {};
    const context = textNode.contextInfo || {};
    const quoted = context.quotedMessage;
    const currentType = ['image','audio','video','sticker'].find(t => content[`${t}Message`]);
    const quotedContent = quoted ? normalizeMessageContent(quoted) || {} : {};
    const mediaContent = currentType ? content : quotedContent;
    const mediaType = currentType || ['image','audio','video','sticker'].find(t => mediaContent[`${t}Message`]);
    identities?.learnMessageKey(raw.key,isGroup);
    const candidates=(isGroup?[raw.key.participantPn,raw.key.participantAlt,raw.key.senderPn]:[raw.key.senderPn,raw.key.remoteJidAlt]).map(userJid).filter(Boolean);
    const primary=isGroup ? [raw.key.participant,raw.participant,raw.key.participantAlt].map(userJid).find(Boolean) : userJid(jid);
    const senderId=identities?.resolve(primary)||primary;
    const canonicalSender=isPhoneJid(senderId)?senderId:candidates.find(isPhoneJid)||senderId;
    if (!/^\d+@(s\.whatsapp\.net|lid)$/.test(canonicalSender)) return null;
    const senderAliases=[...new Set([primary,canonicalSender,...(identities?.aliases(canonicalSender)||[])].filter(Boolean))];
    const bots=new Set(botJids.map(userJid).filter(Boolean));
    const isBot=id=>[...bots].some(bot=>identities?identities.same(id,bot):userJid(id)===bot);
    const quoteSenders = [context.participant, context.participantAlt].map(userJid).filter(Boolean);
    const isReplyToBot = Boolean(quoted && (quoteSenders.some(isBot) ||
        (context.stanzaId && sentMessageKeys?.has(`${jid}:${context.stanzaId}`))));
    const quotedAuthor = isReplyToBot ? 'Hikari' : quoteSenders.some(id =>
        senderAliases.includes(id) || identities?.same(id, canonicalSender)) ? 'pessoa do pedido atual' :
        quoteSenders.length ? 'outro participante' : 'autoria não identificada';
    return {id:raw.key.id,key:raw.key,chatId:isGroup ? jid : canonicalSender,senderId:canonicalSender,senderAliases,transportJid:jid,fromMe:false,isGroup,receivedAt:Date.now(),
        senderName:String(raw.pushName || 'Participante').replace(/[\r\n]/g,' ').slice(0,80),
        isBotMentioned:(textNode.contextInfo?.mentionedJid || []).some(isBot),
        isReplyToBot, quotedAuthor: quoted ? quotedAuthor : undefined,
        text:content.conversation || textNode.text || textNode.caption || '',
        hasMedia:Boolean(mediaType),mediaType,mediaNode:mediaContent[`${mediaType}Message`],
        quotedMessageId:quoted ? context.stanzaId : undefined,
        quotedText:quotedContent.conversation || quotedContent.extendedTextMessage?.text || ''};
}
async function start({store = new Store()} = {}) {
    const wa = await import('baileys');
    const pino = require('pino');
    const qrcode = require('qrcode-terminal');
    fs.mkdirSync(config.authDir,{recursive:true,mode:0o700});
    fs.chmodSync(config.authDir,0o700);
    let releaseLock;
    try { releaseLock = acquireSessionLock(config.authDir); }
    catch (error) {
        logger.event('warn','session-lock',error.message);
        throw error;
    }
    process.once('exit',releaseLock);
    const {state,saveCreds,flush} = await openAuthState(config.authDir,wa);
    logger.system(state.creds.me?.id ? 'Sessão salva encontrada; validando login no WhatsApp.' : 'Sem login salvo; aguardando QR code para pareamento.');
    if (config.notifyOwnerOnConnect && !config.ownerNumbers.length) logger.warn('Configure WHATSAPP_OWNER_NUMBERS para receber a confirmação de conexão.');
    const router = createRouter({store});
    const inbox = new Inbox(path.join(config.dataDir,'pending-requests'),wa.BufferJSON,reason => {
        if (reason === 'delivery') logger.warn('Pedido recuperado com envio incerto; reenvio automático suprimido.');
        else logger.warn('Pedido persistido vencido ou inválido descartado.');
    });
    const processing = new Set();
    let replayTimer, initialBufferTimer;
    const identities = new IdentityMap(path.join(config.dataDir,'identities.json'));
    process.once('exit',()=>identities.flush());
    const sentMessageKeys = new Set();
    const sentMessages = createSentMessageCache((first,second) => identities.same(first,second));
    let socket, timer, stableTimer, stopping = false, attempts = 0, qrCount = 0;
    let saveChain = Promise.resolve();
    function halt(reason) {
        if (stopping) return;
        stopping = true;
        clearTimeout(timer);
        clearTimeout(stableTimer);
        clearInterval(replayTimer);
        clearTimeout(initialBufferTimer);
        router.pause();
        logger.event('warn', 'restricted', reason);
        const closing = socket;
        socket = null;
        closing?.end(new Error('Conexão interrompida por proteção local.'));
    }
    const retryDelay = () => Math.min(120000,10000*2**Math.min(attempts,4));
    const sendSoundSticker = config.soundStickersEnabled
        ? require('./soundSticker').createSoundStickerSender(wa)
        : null;
    const delivery = new AsyncLocalStorage();
    const sendLimited = createSendLimiter({
        send:(current,jid,payload,{beforeSend,...options}) => delivery.run(beforeSend, () => payload.stickerAudio && sendSoundSticker
            ? sendSoundSticker(current,jid,payload,options,() => !stopping && socket === current)
            : current.sendMessage(jid,payload,options)).then(sent => {
                sentMessages.remember(sent);
                return sent;
            }),
        isActive:current => !stopping && socket === current,
        onRateLimit:() => logger.event('warn','send-rate-limit'),
        onRestricted:code => halt(`Envio recusado pelo WhatsApp (${code}); novos envios e reconexões interrompidos. Confira a conta no aplicativo oficial.`)
    });
    const notifiedOwners = new Set();
    const notifyingOwners = new Set();
    async function notifyOwners(currentSocket) {
        if (!config.notifyOwnerOnConnect) return;
        for (const phone of new Set(config.ownerNumbers)) {
            if (stopping || socket !== currentSocket) return;
            if (notifiedOwners.has(phone) || notifyingOwners.has(phone)) continue;
            notifyingOwners.add(phone);
            try {
                await sendLimited(currentSocket,`${phone}@s.whatsapp.net`,{text:'Hikari Zap conectada ao WhatsApp e pronta para receber mensagens. Login confirmado; conversas privadas e grupos disponíveis.'});
                notifiedOwners.add(phone);
                logger.system('Confirmação de conexão enviada ao proprietário.');
            } catch {
                logger.warn('Não foi possível enviar a confirmação ao proprietário. Confira o número configurado; o bot continuará funcionando.');
            } finally {
                notifyingOwners.delete(phone);
            }
        }
    }
    function reconnect(delay) {
        if (stopping) return;
        attempts++;
        clearTimeout(timer);
        logger.info(`Reconexão ${attempts} agendada em ${Math.ceil(delay/1000)} segundos.`);
        timer = setTimeout(() => connect().catch(() => {
            logger.error('Falha ao reconectar usando a sessão salva.');
            if (!stopping) reconnect(retryDelay());
        }),delay);
    }
    async function connect() {
        if (stopping) return;
        await saveChain;
        if (stopping) return;
        socket = wa.default({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false,
            shouldSyncHistoryMessage:() => false,defaultQueryTimeoutMs:45000,
            getMessage:async key => sentMessages.get(key),
            patchMessageBeforeSending:message => {
                delivery.getStore()?.();
                return message;
            }
        });
        const currentSocket = socket;
        const learnContacts = contacts => {
            if(stopping||socket!==currentSocket)return;
            for(const contact of contacts||[])identities.learnContact(contact);
        };
        currentSocket.ev.on('contacts.upsert',learnContacts);
        currentSocket.ev.on('contacts.update',learnContacts);
        currentSocket.ev.on('chats.phoneNumberShare',pair => {
            if(!stopping&&socket===currentSocket)identities.learn([pair.lid,pair.jid]);
        });
        currentSocket.ev.on('groups.upsert',groups => {
            if(!stopping&&socket===currentSocket)for(const group of groups||[])learnContacts(group.participants);
        });
        currentSocket.ev.on('creds.update',() => {
            if (stopping || socket !== currentSocket) return;
            const persist = saveCreds;
            saveChain = saveChain.then(persist).catch(() => logger.error('Falha ao salvar sessão WhatsApp.'));
        });
        currentSocket.ev.on('connection.update',update => {
            if (stopping || socket !== currentSocket) return;
            if (update.receivedPendingNotifications) clearTimeout(initialBufferTimer);
            if (update.qr) {
                if (++qrCount > 2) {
                    halt('Prazo de pareamento encerrado. Nenhuma nova tentativa automática será feita; confira se a conta permite adicionar dispositivos.');
                    return;
                }
                logger.event('system', 'pairing');
                qrcode.generate(update.qr, { small: true }, drawing => process.stdout.write(drawing));
            }
            if (update.connection === 'open') {
                identities.learn([socket.user?.id,socket.user?.lid,state.creds.me?.id,state.creds.me?.lid]);
                clearTimeout(stableTimer);
                stableTimer = setTimeout(() => { attempts = 0; },120000);
                logger.event('system', 'online', 'Login confirmado. Hikari Zap conectada; chats privados e grupos.');
                clearTimeout(initialBufferTimer);
                initialBufferTimer = setTimeout(() => {
                    releaseInitialBuffer(currentSocket.ev,
                        () => !stopping && socket === currentSocket,
                        () => logger.event('warn','initial-buffer-released'));
                },10000);
                initialBufferTimer.unref();
                notifyOwners(currentSocket).catch(() => logger.warn('Falha na confirmação ao proprietário.'));
                const recover = () => {
                    if (stopping || socket !== currentSocket || router.queue.paused) return;
                    try {
                        for (const [id,record] of inbox.recovered(id=>processing.has(id))) {
                            if (router.canRecover(record)) dispatch(record.raw,true);
                        }
                    } catch (error) { logger.error('Falha ao recuperar a fila:',error); }
                };
                clearInterval(replayTimer);
                replayTimer = setInterval(recover,2000);
                recover();
            }
            if (update.connection === 'close') {
                const persist = saveCreds;
                saveChain = saveChain.then(persist).catch(() => logger.error('Falha ao salvar sessão WhatsApp.'));
                socket = null;
                router.cancelPending();
                clearTimeout(initialBufferTimer);
                clearInterval(replayTimer);
                clearTimeout(timer);
                clearTimeout(stableTimer);
                const error = update.lastDisconnect?.error;
                const code = Number(error?.output?.statusCode) || undefined;
                const reasonNode = Array.isArray(error?.data?.content) ? error.data.content.find(node => node?.tag) : null;
                const reason = String(reasonNode?.tag || error?.data?.reason || error?.data?.attrs?.reason || 'nao-informado').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
                logger.event('warn', 'disconnected', `Conexão WhatsApp fechada: código ${code || 'desconhecido'}; motivo ${reason}.`, code);
                if ([wa.DisconnectReason.loggedOut,wa.DisconnectReason.connectionReplaced,wa.DisconnectReason.forbidden,wa.DisconnectReason.multideviceMismatch,405,406,429].includes(code)) {
                    halt('Login encerrado, conexão recusada ou restrita. Sessão preservada; não será solicitado outro QR automaticamente. Confira a conta no aplicativo oficial antes de reiniciar.');
                    return;
                }
                logger.info(code === wa.DisconnectReason.restartRequired ? 'Finalizando pareamento; reconectando com a sessão salva.' : 'Reconectando sem descartar o login salvo.');
                reconnect(code === wa.DisconnectReason.restartRequired ? 1000 : retryDelay());
            }
        });
        let lastProgressAt = 0;
        function dispatch(raw,recovered = false) {
            if (stopping || socket !== currentSocket || !raw.key?.id) return;
            const requestId = inbox.key(raw);
            if (processing.has(requestId) || (!recovered && inbox.pending.has(requestId))) return;
            const normalized = normalizeIncoming(raw,wa.normalizeMessageContent,{botJids:[socket.user?.id,socket.user?.lid,state.creds.me?.id,state.creds.me?.lid],sentMessageKeys,identities});
            if (!normalized) {
                if (recovered) inbox.finish(requestId);
                return;
            }
            normalized.recovered = recovered;
            let persisted = recovered;
            normalized.persist = lane => {
                inbox.admit(requestId,{raw,chatId:normalized.chatId,lane,at:Date.now()});
                persisted = true;
            };
            let attemptedSend = false;
            Object.defineProperty(normalized,'allowProgress',{get() {
                const now = Date.now();
                if (now - lastProgressAt < 4000) return false;
                lastProgressAt = now;
                return true;
            }});
            logger.event('zap', 'incoming', `Mensagem recebida de "${normalized.senderName}" (${normalized.senderId}) no chat ${normalized.chatId} [${normalized.isGroup ? 'GRUPO' : 'PRIVADO'}] | Texto: "${normalized.text}"${normalized.hasMedia ? ` | Anexo: ${normalized.mediaType}` : ''}`);
            let mediaPromise;
            normalized.getMedia = signal => mediaPromise ||= (async () => {
                const node = normalized.mediaNode;
                if (!node) return null;
                if (Number(node.fileLength || 0) > config.maxMediaBytes) throw new Error('Anexo acima do limite de mídia.');
                const mediaSignal = signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
                const stream = await wa.downloadContentFromMessage(node,normalized.mediaType,{options:{signal:mediaSignal,timeout:45000}});
                const abort = () => stream.destroy(mediaSignal.reason);
                mediaSignal.addEventListener('abort',abort,{once:true});
                const chunks = [];
                let size = 0;
                try {
                    mediaSignal.throwIfAborted();
                    for await (const chunk of stream) {
                        size += chunk.length;
                        if (size > config.maxMediaBytes) throw new Error('Anexo acima do limite de mídia.');
                        chunks.push(chunk);
                    }
                } finally { mediaSignal.removeEventListener('abort',abort); stream.destroy(); }
                return {buffer:Buffer.concat(chunks),mimetype:node.mimetype || ({image:'image/jpeg',video:'video/mp4',sticker:'image/webp',audio:'audio/ogg'}[normalized.mediaType]),type:normalized.mediaType};
            })();
            normalized.react = async emoji => {
                try {
                    if (stopping || socket !== currentSocket) return;
                    logger.zap(`Reagindo com "${emoji || 'remover'}" na mensagem ${raw.key.id}`);
                    await currentSocket.sendMessage(normalized.transportJid, { react: { text: String(emoji || ''), key: raw.key } });
                } catch {}
            };
            normalized.delete = async () => {
                try {
                    if (stopping || socket !== currentSocket) return false;
                    logger.zap(`Excluindo mensagem ${raw.key.id} no chat ${normalized.transportJid}`);
                    await currentSocket.sendMessage(normalized.transportJid, { delete: raw.key });
                    return true;
                } catch (err) {
                    logger.warn(`Não foi possível excluir a mensagem: ${err.message}`);
                    return false;
                }
            };
            let readReceiptAttempted = false;
            normalized.send = async (payload, options = {}) => {
                const targetJid = options.targetJid || payload.targetJid || normalized.transportJid;
                const sendReply = async content => {
                    if (stopping || socket !== currentSocket) throw new Error('Conexão WhatsApp interrompida; tente novamente após reconectar.');
                    const sendOptions = targetJid === normalized.transportJid ? { quoted: raw } : {};
                    if (content.audio || content.video || content.document || content.image || content.sticker) {
                        sendOptions.mediaUploadTimeoutMs = 45000;
                    }
                    if (content.stickerAudio) sendOptions.soundStickerSignal = options.signal;
                    sendOptions.beforeSend = () => {
                        options.signal?.throwIfAborted();
                        if (stopping || socket !== currentSocket) throw new Error('Conexão interrompida antes do envio.');
                        if (options.queueNotice || attemptedSend) return;
                        inbox.markSending(requestId);
                        attemptedSend = true;
                    };
                    const sent = await sendLimited(currentSocket, targetJid, content, sendOptions, options.signal,
                        options.queueNotice ? 'notice' : options.help ? 'help' : options.stickerDelivery ? 'sticker' : 'normal');
                    if (sent) logger.event('zap', 'outgoing', `Resposta enviada para ${targetJid}: ${typeof content.text === 'string' ? content.text : Object.keys(content).join(', ')}`);
                    if (sent?.key?.id) {
                        sentMessageKeys.add(`${targetJid}:${sent.key.id}`);
                        if (sentMessageKeys.size > 2000) sentMessageKeys.delete(sentMessageKeys.values().next().value);
                    }
                    if (!readReceiptAttempted && targetJid === normalized.transportJid && !stopping && socket === currentSocket) {
                        readReceiptAttempted = true;
                        void Promise.resolve().then(() => currentSocket.readMessages([raw.key])).catch(() => {
                            logger.warn('Resposta enviada, mas não foi possível confirmar a leitura da mensagem.');
                        });
                    }
                    return sent;
                };
                for (const value of Object.values(payload)) if (Buffer.isBuffer(value) && value.length > config.maxMediaBytes) throw new Error('Arquivo acima do limite de envio.');
                if (typeof payload.text === 'string') {
                    return sendReply({text:payload.text.slice(0,24000)});
                }
                const cleanPayload = {...payload};
                delete cleanPayload.targetJid;
                if (Buffer.isBuffer(cleanPayload.sticker)) {
                    const sticker = cleanPayload.sticker;
                    cleanPayload.isAnimated = sticker.toString('ascii',12,16) === 'VP8X' && Boolean(sticker[20] & 2);
                }
                return sendReply(cleanPayload);
            };
            processing.add(requestId);
            let defer = false;
            void router.handle(normalized).catch(error => {
                defer = recovered && ['QUEUE_FULL','QUEUE_PAUSED'].includes(error.code);
                if (!defer) logger.error('Falha ao processar mensagem WhatsApp:',error);
            }).finally(() => {
                try {
                    if (persisted && !defer && (attemptedSend || (!stopping && socket === currentSocket))) inbox.finish(requestId);
                } catch (error) { logger.error('Falha ao finalizar pedido na fila:',error); }
                finally { processing.delete(requestId); }
            });
        }
        currentSocket.ev.on('messages.upsert',event => {
            if (stopping || socket !== currentSocket) return;
            for (const raw of event.messages) {
                if (!isRecentIncoming(event.type,raw)) continue;
                try { dispatch(raw); } catch (error) { logger.error('Falha ao receber pedido:',error); }
            }
        });
    }
    const stop = async () => {
        halt('Hikari Zap encerrada.');
        try {
            await saveChain;
            await saveCreds();
            await flush();
        } catch (error) { logger.event('error','auth-save',error); }
        finally { identities.flush(); releaseLock(); }
    };
    process.once('SIGINT',() => stop().finally(() => process.exit(0)));
    process.once('SIGTERM',() => stop().finally(() => process.exit(0)));
    try { await connect(); } catch (error) {
        await stop();
        throw error;
    }
    return {stop,router};
}
module.exports = { start, normalizeIncoming, isRecentIncoming, releaseInitialBuffer, createSentMessageCache, chatJid };
