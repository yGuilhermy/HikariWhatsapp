const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

async function openAuthState(directory, {initAuthCreds, BufferJSON, proto}) {
    let writeChain = Promise.resolve();

    const filePath = file => path.join(directory,file.replaceAll('/','__').replaceAll(':','-'));

    async function read(file) {
        try {
            return JSON.parse(await fs.readFile(filePath(file),'utf8'),BufferJSON.reviver);
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async function write(file,data) {
        const target = filePath(file);
        if (data == null) {
            await fs.rm(target,{force:true});
            return;
        }
        const temp = target + '.' + randomUUID() + '.tmp';
        try {
            const fd = await fs.open(temp,'wx',0o600);
            try {
                await fd.writeFile(JSON.stringify(data,BufferJSON.replacer));
                await fd.sync();
            } finally { await fd.close(); }
            await fs.rename(temp,target);
        } finally {
            await fs.rm(temp,{force:true});
        }
    }

    function serialize(operation) {
        const result = writeChain.then(operation);
        writeChain = result.catch(() => {});
        return result;
    }

    const creds = await read('creds.json') || initAuthCreds();
    return {
        state:{
            creds,
            keys:{
                async get(type,ids) {
                    await writeChain;
                    const pairs = await Promise.all(ids.map(async id => {
                        const data = await read(type+'-'+id+'.json');
                        return [id, data && type === 'app-state-sync-key'
                            ? proto.Message.AppStateSyncKeyData.fromObject(data) : data];
                    }));
                    return Object.fromEntries(pairs);
                },
                set(data) {
                    return serialize(async () => {
                        for (const [type,items] of Object.entries(data)) {
                            await Promise.all(Object.entries(items).map(([id,value])=>write(type+'-'+id+'.json',value)));
                        }
                    });
                }
            }
        },
        saveCreds:()=>serialize(()=>write('creds.json',creds)),
        flush:()=>writeChain
    };
}
module.exports={openAuthState};
