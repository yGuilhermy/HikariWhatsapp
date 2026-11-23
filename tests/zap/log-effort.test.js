const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

for (const effort of ['0', '1', '2', 'invalid']) {
    test(`WhatsApp LOG_EFFORT=${effort} filters terminal and never opens a log directory`, () => {
        const root = path.resolve(__dirname, '../..');
        const logDir = `unused-log-test-${randomUUID()}`;
        const cp = spawnSync(process.execPath, ['-e', `
            const { logger } = require('./src/utils/logger');
            logger.event('system', 'online');
            logger.event('warn', 'api-failure', 'user-private-123 diagnostic-test-secret', 429);
            console.warn('prompt-private-456');
        `], { cwd: root, env: {
            ...process.env, LOG_EFFORT: effort, LOG_DIR: logDir, GEMINI_API_KEY: 'diagnostic-test-secret'
        }, encoding: 'utf8', timeout: 5000 });
        assert.equal(cp.status, 0, cp.stderr);
        const output = cp.stdout + cp.stderr;
        assert.match(output, /Hikari conectada/);
        assert.doesNotMatch(output, /diagnostic-test-secret/);
        assert.equal(fs.existsSync(path.join(root, logDir)), false);
        if (effort === '0') assert.doesNotMatch(output, /429|user-private|prompt-private/);
        else if (effort === '2') {
            assert.match(output, /user-private-123/);
            assert.match(output, /prompt-private-456/);
        } else {
            assert.match(output, /HTTP 429/);
            assert.doesNotMatch(output, /user-private|prompt-private/);
        }
    });
}
