const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const MAX_AGE_MS = 15 * 60_000;
const MAX_RECORD_BYTES = 256 * 1024;

class Inbox {
    constructor(directory, bufferJSON, onDiscard) {
        this.directory = directory;
        this.bufferJSON = bufferJSON;
        this.pending = new Map();
        fs.mkdirSync(directory, {recursive:true,mode:0o700});
        fs.chmodSync(directory,0o700);
        for (const name of fs.readdirSync(directory)) {
            if (!/^[a-f0-9]{64}\.(pending|sending|tmp)$/.test(name)) continue;
            const file = path.join(directory,name);
            if (!name.endsWith('.pending')) {
                fs.unlinkSync(file);
                if (name.endsWith('.sending')) onDiscard('delivery');
                continue;
            }
            try {
                if (fs.statSync(file).size > MAX_RECORD_BYTES) throw new Error();
                const record = JSON.parse(fs.readFileSync(file,'utf8'),bufferJSON.reviver);
                const id = this.key(record.raw);
                if (file !== this.file(id,'pending') || !Number.isFinite(record.at) || Date.now()-record.at >= MAX_AGE_MS) {
                    throw new Error();
                }
                this.pending.set(id,record);
            } catch {
                fs.unlinkSync(file);
                onDiscard('expired');
            }
        }
    }

    key(raw) {
        return createHash('sha256').update(JSON.stringify([raw.key.remoteJid,raw.key.id])).digest('hex');
    }

    file(id,state) {
        return path.join(this.directory,id + '.' + state);
    }

    admit(id,record) {
        if (this.pending.has(id)) return;
        if (this.pending.size >= 128) {
            throw Object.assign(new Error('Fila persistente cheia.'),{code:'QUEUE_FULL'});
        }
        const data = JSON.stringify(record,this.bufferJSON.replacer);
        if (Buffer.byteLength(data) > MAX_RECORD_BYTES) throw new Error('Pedido acima do limite de armazenamento da fila.');
        const temp = this.file(id,'tmp');
        const fd = fs.openSync(temp,'w',0o600);
        try {
            fs.writeFileSync(fd,data);
            fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        fs.renameSync(temp,this.file(id,'pending'));
        this.pending.set(id,record);
    }

    markSending(id) {
        if (!this.pending.has(id)) return;
        fs.renameSync(this.file(id,'pending'),this.file(id,'sending'));
        this.pending.delete(id);
    }

    finish(id) {
        fs.rmSync(this.file(id,'pending'),{force:true});
        fs.rmSync(this.file(id,'sending'),{force:true});
        this.pending.delete(id);
    }

    recovered(isRunning) {
        const ready = [];
        for (const [id,record] of this.pending) {
            if (isRunning(id)) continue;
            if (Date.now() - record.at >= MAX_AGE_MS) {
                this.finish(id);
                continue;
            }
            ready.push([id,record]);
        }
        return ready.sort((a,b)=>a[1].at-b[1].at);
    }
}

module.exports = {Inbox,MAX_AGE_MS};
