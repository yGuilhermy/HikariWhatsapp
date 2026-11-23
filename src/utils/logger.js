const path = require('node:path');
const { render, hookConsole, redact } = require('./logPolicy');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const categories = {
    system: 'SYSTEM', zap: 'ZAP', command: 'COMMAND', ai: 'AI/LLM',
    historico: 'HISTORICO', media: 'MEDIA', voice: 'VOICE', search: 'SEARCH',
    music: 'MUSIC', security: 'SECURITY', warn: 'WARN', error: 'ERROR',
    info: 'INFO', debug: 'INFO', tool: 'MCP/TOOL', image: 'MEDIA', vision: 'VISION'
};

function emit(category, severity, args, event, status) {
    const entry = render(category, severity, args, event, status);
    if (!entry) return;
    const stream = severity === 'ERROR' || severity === 'WARN' ? process.stderr : process.stdout;
    stream.write(`${new Date().toISOString()} [${category}] ${severity} ${entry.text}\n`);
}

const logger = Object.fromEntries(Object.entries(categories).map(([method, category]) => [
    method, (...args) => emit(category, method === 'error' ? 'ERROR' : method === 'warn' || method === 'security' ? 'WARN' : 'INFO', args)
]));
logger.event = (category, event, details, status) => emit(
    categories[category] || 'SYSTEM', category === 'error' ? 'ERROR' : category === 'warn' ? 'WARN' : 'INFO',
    details === undefined ? [] : [details], event, status
);

hookConsole((severity, args) => {
    const first = args[0];
    if (typeof first === 'string' && /Failed to decrypt message with any known session|Bad MAC|SessionCipher|Closing session:|Opening session:|Session already closed|Session already open/i.test(first)) return;
    emit('CONSOLE', severity, args);
});

module.exports = { logger, sanitize: redact, sanitizePaths: redact, flush: async () => {} };
