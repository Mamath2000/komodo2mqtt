const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger } = require('../src/logger');
const { loadConfig } = require('../src/config');

function capture(level) {
    const lines = [];
    const log = createLogger({ level, write: (lvl, line) => lines.push([lvl, line]) });
    return { log, lines };
}

test('filtrage par niveau', () => {
    const { log, lines } = capture('warn');
    log.error('e');
    log.warn('w');
    log.info('i');
    log.debug('d');
    assert.deepEqual(lines.map(([l]) => l), ['error', 'warn']);
    log.setLevel('debug');
    log.debug('d');
    assert.equal(lines.length, 3);
    assert.ok(log.isDebug());
});

test('format : horodatage, niveau, arguments', () => {
    const { log, lines } = capture('info');
    log.info('msg', { a: 1 }, 'x');
    assert.match(lines[0][1], /^\d{4}-\d{2}-\d{2}T[\d:.]+Z INFO  msg \{"a":1\} x$/);
});

test('setLevel refuse un niveau inconnu', () => {
    assert.throws(() => createLogger().setLevel('trace'), /inconnu/);
});

test('loadConfig : log_level, LOG_LEVEL, --debug', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'k2m-')), 'config.conf');
    fs.writeFileSync(file, JSON.stringify({ komodo: { url: 'http://k' }, mqtt: { broker: 'mqtt://b' }, log_level: 'warn' }));
    const env = { CONFIG_FILE: file, KOMODO_API_KEY: 'k', KOMODO_API_SECRET: 's' };
    assert.equal(loadConfig({ env }).log_level, 'warn');
    assert.equal(loadConfig({ env: { ...env, LOG_LEVEL: 'error' } }).log_level, 'error');
    assert.equal(loadConfig({ env, args: new Set(['--debug']) }).log_level, 'debug');
    assert.throws(() => loadConfig({ env: { ...env, LOG_LEVEL: 'bavard' } }), /inconnu/);
});
