const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

function acquireSessionLock(directory) {
    const file = path.join(directory,'hikari-process.lock');
    const content = JSON.stringify({pid:process.pid,token:randomUUID()});
    for (let attempt=0;attempt<2;attempt++) {
        let descriptor;
        try {
            descriptor = fs.openSync(file,'wx',0o600);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const previous = fs.readFileSync(file,'utf8');
            let pid;
            try { pid = JSON.parse(previous).pid; } catch {}
            if (!Number.isInteger(pid) || pid <= 0) throw new Error('Trava de sessão inválida; confira se outra Hikari está aberta antes de remover hikari-process.lock.');
            let running = true;
            try { process.kill(pid,0); } catch (reason) {
                if (reason.code === 'ESRCH') running = false;
            }
            if (running) throw new Error('Outra instância já está usando esta sessão WhatsApp. Encerre-a antes de iniciar novamente.');
            if (fs.readFileSync(file,'utf8') === previous) fs.unlinkSync(file);
            continue;
        }
        try { fs.writeFileSync(descriptor,content); } finally { fs.closeSync(descriptor); }
        return () => {
            try { if (fs.readFileSync(file,'utf8') === content) fs.unlinkSync(file); } catch {}
        };
    }
    throw new Error('Não foi possível reservar a sessão WhatsApp para esta instância.');
}

function createSendLimiter({
    send,isActive,onRestricted,onLimit,windowMs=60000,minGapMs=2000,
    globalLimit=20,chatLimit=6,now=Date.now,sleep=delay
}) {
    let transport = Promise.resolve();
    let pending = 0;
    let lastAttempt = -Infinity;
    let recent = [];
    const byChat = new Map();
    const unavailable = () => Object.assign(new Error('Conexão interrompida antes do envio.'),{silent:true});

    return async (socket,jid,payload,options = {},signal) => {
        signal?.throwIfAborted();
        if (pending >= 20) {
            throw Object.assign(new Error('Fila de envios cheia.'),{code:'SEND_QUEUE_FULL'});
        }
        pending++;
        try {
            for (;;) {
                signal?.throwIfAborted();
                if (!isActive(socket)) throw unavailable();
                const busy = transport;
                await busy;
                if (busy !== transport) continue;
                signal?.throwIfAborted();
                if (!isActive(socket)) throw unavailable();
                const at = now();
                recent = recent.filter(time=>at-time<windowMs);
                for (const [chat,times] of byChat) {
                    const live = times.filter(time=>at-time<windowMs);
                    if (live.length) byChat.set(chat,live); else byChat.delete(chat);
                }
                const times = byChat.get(jid) || [];
                const wait = Math.max(0,lastAttempt+minGapMs-at,
                    recent.length>=globalLimit ? recent[0]+windowMs-at : 0,
                    times.length>=chatLimit ? times[0]+windowMs-at : 0);
                if (wait) {
                    onLimit?.();
                    try { await sleep(wait,undefined,{signal}); }
                    catch (error) { throw signal?.reason || error; }
                    continue;
                }
                lastAttempt = at;
                recent.push(at);
                byChat.set(jid,[...times,at]);
                const sending = Promise.resolve().then(async () => {
                    try { return await send(socket,jid,payload,options); }
                    catch (error) {
                        const code = Number(error?.output?.statusCode || error?.statusCode || error?.response?.status);
                        if ([401,403,429].includes(code)) {
                            onRestricted(code);
                            error.silent = true;
                        }
                        throw error;
                    }
                });
                transport = sending.catch(() => {});
                return await sending;
            }
        } finally { pending--; }
    };
}
module.exports = {acquireSessionLock,createSendLimiter};
