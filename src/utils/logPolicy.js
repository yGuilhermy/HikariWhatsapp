const util = require('node:util');

const events = {
    starting: 'Iniciando a Hikari.',
    online: 'Hikari conectada e pronta.',
    fatal: 'A Hikari encontrou uma falha de inicialização ou execução.',
    pairing: 'Abra WhatsApp > Aparelhos conectados > Conectar aparelho e escaneie o QR.',
    disconnected: 'A plataforma encerrou a conexão.',
    restricted: 'Conexão interrompida. Confira a conta no aplicativo oficial.',
    incoming: 'Mensagem recebida.',
    outgoing: 'Resposta enviada à plataforma.',
    queued: 'Pedido encaminhado à fila.',
    command: 'Comando acionado.',
    api: 'Requisição de IA iniciada.',
    'api-success': 'O provedor respondeu.',
    'api-failure': 'A requisição ao provedor falhou.',
    tool: 'Ferramenta MCP acionada.',
    moderation: 'Evento de moderação registrado.'
};

const essential = new Set(['starting', 'online', 'fatal', 'pairing', 'restricted']);
const privateKey = /key|token|password|secret|authorization|cookie|^arl$|^avisos_url$|webhook/i;

function effort(value = process.env.LOG_EFFORT) {
    const mode = String(value ?? '').trim();
    return ['0', '1', '2'].includes(mode) ? Number(mode) : 1;
}

function redact(value) {
    let text = String(value ?? '');
    const secrets = Object.entries(process.env)
        .filter(([key, value]) => privateKey.test(key) && value)
        .flatMap(([, value]) => [value, ...value.split(',').map(part => part.trim())])
        .filter(value => value.length >= 6).sort((a, b) => b.length - a.length);
    for (const secret of secrets) text = text.split(secret).join('[OCULTO]');
    return text
        .replace(/(discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[^\s"'?]+/gi, '$1[OCULTO]')
        .replace(/\b(Bearer|Bot)\s+[A-Za-z0-9_.~+/-]{16,}={0,2}/gi, '$1 [OCULTO]')
        .replace(/\b(?:AIza[\w-]{20,}|gsk_[\w-]{16,}|hf_[A-Za-z0-9]{16,})\b/g, '[OCULTO]')
        .replace(/[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}/g, '[OCULTO]')
        .replace(/(["']?(?:x-goog-api-key|api[_-]?key|token|password|secret|arl|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1[OCULTO]')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

function detailed(args) {
    return redact(util.formatWithOptions({ colors: false, depth: 5, getters: false, customInspect: false }, ...args));
}

function render(category, severity, args = [], event = null, status = null) {
    const mode = effort();
    if (mode === 0 && !essential.has(event)) return null;
    const code = typeof status === 'number' || /^\d{3}$/.test(status) ? Number(status) : NaN;
    const suffix = Number.isInteger(code) && code >= 100 && code <= 599 ? ` (HTTP ${code})` : '';
    const summary = Object.hasOwn(events, event) ? events[event] + suffix : (
        severity === 'ERROR' ? 'Falha registrada.' : severity === 'WARN' ? 'Aviso registrado.' : 'Atividade registrada.'
    );
    return { category, severity, text: mode === 2 && args.length && args[0] !== '' && args[0] !== undefined ? detailed(args) : summary };
}

function hookConsole(write) {
    for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupCollapsed']) {
        const severity = method === 'error' || method === 'trace' ? 'ERROR' : method === 'warn' ? 'WARN' : 'INFO';
        console[method] = (...args) => write(severity, args);
    }
}

module.exports = { effort, redact, detailed, render, hookConsole };
