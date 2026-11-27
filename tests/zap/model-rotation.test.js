const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const axios=require('axios');
const config=require('../../src/config');
const {ProviderPool}=require('../../src/services/aiProviders');
function fixture(t) {
    const saved={...config},original=axios.post;
    const envNames=['GROQ_CHAT_ENABLED','GROQ_CHAT_API_KEY','GROQ_API_KEY','POLLINATIONS_API_KEY','ALLOW_PUBLIC_POLLINATIONS'];
    const env=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
    for(const key of envNames)delete process.env[key];
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikari-pool-'));
    Object.assign(config,{geminiModels:['first','second'],geminiApiKeys:['fake-a','fake-b'],localLlmEnabled:false,hfToken:'',groqModels:['groq-ok'],aiProviderOrder:['gemini','groq'],llmTimeout:100,llmAttemptTimeout:100,llmCompletionBudget:500,llmMaxAttempts:4,llmMaxProviderAttempts:2});
    const pool=new ProviderPool({file:path.join(dir,'health.json')});
    t.after(()=>{pool.close();axios.post=original;Object.assign(config,saved);for(const key of envNames){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}fs.rmSync(dir,{recursive:true,force:true});});
    return {pool,dir};
}
const payload={messages:[{role:'user',content:'oi'}],max_tokens:64};
const accept=message=>message.content?{content:message.content}:null;
const ok=()=>({data:{choices:[{message:{content:'OK'}}]}});
test('modelo 404 não percorre todas as chaves antes de usar outro modelo',async t=>{
    const {pool}=fixture(t);config.aiProviderOrder=['gemini'];const calls=[];
    axios.post=async(url,body,options)=>{calls.push([body.model,options.headers.Authorization]);if(body.model==='first')throw Object.assign(new Error('404'),{response:{status:404}});return ok();};
    assert.equal((await pool.complete(payload,undefined,accept)).content,'OK');
    assert.deepEqual(calls.map(x=>x[0]),['first','second']);
    assert.equal(calls.length,2);
});
test('429 pausa a combinação de chave e modelo respeitando Retry-After',async t=>{
    const {pool}=fixture(t);config.geminiModels=['first'];
    const calls=[];
    axios.post=async(url,body,options)=>{
        const key=options.headers.Authorization;
        calls.push(key);
        if(key==='Bearer fake-a')throw Object.assign(new Error('429'),{response:{status:429,headers:{'retry-after':'120'},data:{error:{message:'quota'}}}});
        return ok();
    };
    await pool.complete(payload,undefined,accept);
    await pool.complete(payload,undefined,accept);
    assert.deepEqual(calls,['Bearer fake-a','Bearer fake-b','Bearer fake-b']);
    assert.ok([...pool.health.entries()].some(([id,x])=>id.startsWith('pair:gemini:')&&x.kind==='rate-limit'&&x.until-Date.now()>119000));
});

test('403 pausa a credencial para todos os modelos e o cache não contém chaves ou prompts',async t=>{
    const {pool,dir}=fixture(t);config.geminiApiKeys=['fake-key-private'];process.env.GROQ_CHAT_ENABLED='true';process.env.GROQ_CHAT_API_KEY='fake-groq-key';const calls=[];
    axios.post=async(url,body)=>{calls.push(body.model);if(body.model!=='groq-ok')throw Object.assign(new Error('403'),{response:{status:403,data:{error:{message:'billing required'}}}});return ok();};
    await pool.complete(payload,undefined,accept);pool.lastWinner=null;
    await pool.complete(payload,undefined,accept);pool.flush();
    assert.deepEqual(calls,['first','groq-ok','groq-ok']);
    const saved=fs.readFileSync(path.join(dir,'health.json'),'utf8');
    assert.ok(!saved.includes('fake-key-private'));assert.ok(!saved.includes('fake-groq-key'));assert.ok(!saved.includes('messages'));
});
test('falha temporária carrega cooldown após reiniciar o pool',async t=>{
    const {pool,dir}=fixture(t);config.geminiModels=['first'];config.aiProviderOrder=['gemini'];
    axios.post=async()=>{throw Object.assign(new Error('503'),{response:{status:503}});};
    await assert.rejects(pool.complete(payload,undefined,accept),e=>e.code==='AI_UNAVAILABLE');pool.flush();
    const reopened=new ProviderPool({file:path.join(dir,'health.json')});t.after(()=>reopened.close());
    let calls=0;axios.post=async()=>{calls++;return ok();};
    await assert.rejects(reopened.complete(payload,undefined,accept),e=>e.code==='AI_UNAVAILABLE');assert.equal(calls,0);
});

test('Gemini nativo ignora partes privadas de pensamento e compartilha pausa da mesma chave e modelo',async t=>{
    const {pool}=fixture(t);config.geminiModels=['first'];config.geminiApiKeys=['fake-a'];
    axios.post=async()=>({data:{candidates:[{content:{parts:[{thought:true,text:'private'},{text:'OK'}]}}]}});
    assert.equal(await pool.generateGemini({contents:[{parts:[{text:'oi'}]}]}),'OK');
    axios.post=async()=>{throw Object.assign(new Error('429'),{response:{status:429}});};
    await assert.rejects(pool.generateGemini({contents:[]}),e=>e.code==='AI_UNAVAILABLE');
    let called=false;axios.post=async()=>{called=true;return ok();};
    await assert.rejects(pool.complete(payload,undefined,accept),e=>e.code==='AI_UNAVAILABLE');assert.equal(called,false);
});

test('permissão recusada para um modelo não desativa a chave para outros modelos',async t=>{
    const {pool}=fixture(t);config.aiProviderOrder=['gemini'];config.geminiApiKeys=['fake-one-key'];const calls=[];
    axios.post=async(url,body)=>{calls.push(body.model);if(body.model==='first')throw Object.assign(new Error('403'),{response:{status:403,data:{error:{message:'model first is not permitted for this key'}}}});return ok();};
    assert.equal((await pool.complete(payload,undefined,accept)).content,'OK');assert.deepEqual(calls,['first','second']);
    assert.ok(![...pool.health.values()].some(entry=>entry.kind==='credential'));
});

test('resposta vazia tenta o fallback antes de repetir o mesmo modelo', async t => {
    const {pool}=fixture(t);
    const called=[];
    axios.post=async (_,body)=>{
        called.push(body.model);
        return body.model==='first'?{data:{choices:[{message:{content:''}}]}}:ok();
    };
    assert.equal((await pool.complete(payload,undefined,accept)).content,'OK');
    assert.deepEqual(called,['first','second']);
    assert.equal(pool.health.size,0);
});

test('cada requisição respeita o orçamento total de tempo e de tentativas', async t => {
    const {pool}=fixture(t);
    let now=1000000000;
    t.mock.method(Date,'now',()=>now);
    Object.assign(config,{llmTimeout:1000,llmAttemptTimeout:1000,llmCompletionBudget:1100,llmMaxAttempts:4});
    const timeouts=[];
    axios.post=async(_,body,options)=>{
        timeouts.push(options.timeout);
        now+=options.timeout;
        throw Object.assign(new Error('timeout'),{code:'ETIMEDOUT'});
    };
    await assert.rejects(pool.complete(payload,undefined,accept),{code:'AI_UNAVAILABLE'});
    assert.deepEqual(timeouts,[1000,100]);
});

test('quatro modelos são tentados em cada chave antes de avançar para a próxima', async t => {
    const {pool}=fixture(t);
    Object.assign(config,{geminiModels:['m1','m2','m3','m4','m5'],geminiApiKeys:['fake-a','fake-b'],
        llmMaxAttempts:8,llmMaxProviderAttempts:1});
    const calls=[];
    axios.post=async(_,body,options)=>{
        calls.push([options.headers.Authorization,body.model]);
        if(calls.length<8)throw Object.assign(Error('429'),{response:{status:429}});
        return ok();
    };
    assert.equal((await pool.complete(payload,undefined,accept)).content,'OK');
    assert.deepEqual(calls,['fake-a','fake-b'].flatMap(key=>['m1','m2','m3','m4'].map(model=>['Bearer '+key,model])));
});

test('Gemini nativo mantém os quatro modelos da mesma chave',async t=>{
    const {pool}=fixture(t);
    Object.assign(config,{geminiModels:['m1','m2','m3','m4'],geminiApiKeys:['fake-a','fake-b'],llmMaxAttempts:8});
    const calls=[];
    axios.post=async(url,_,options)=>{
        calls.push([options.headers['x-goog-api-key'],url.match(/models\/([^:]+):/)[1]]);
        if(calls.length<5)throw Object.assign(Error('429'),{response:{status:429}});
        return {data:{candidates:[{content:{parts:[{text:'OK'}]}}]}};
    };
    assert.equal(await pool.generateGemini({contents:[]}),'OK');
    assert.deepEqual(calls,[['fake-a','m1'],['fake-a','m2'],['fake-a','m3'],['fake-a','m4'],['fake-b','m1']]);
});
