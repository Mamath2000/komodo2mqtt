const test = require('node:test');
const assert = require('node:assert/strict');
const { runCheck } = require('../src/check');

function fake(handlers) {
    return {
        url: 'http://k',
        read: async (type, p) => {
            const h = handlers[type];
            if (!h) return [];
            if (h instanceof Error) throw h;
            return typeof h === 'function' ? h(p) : h;
        },
        list: (type, p) => fake(handlers).read(type, p),
    };
}
const run = async (handlers) => {
    const lines = [];
    const ok = await runCheck(fake(handlers), (l) => lines.push(l));
    return { ok, text: lines.join('\n') };
};

test('check : tout va bien', async () => {
    const { ok, text } = await run({
        GetVersion: { version: '2.3.0' },
        ListServers: [{ id: 's1', name: 'nas', info: { state: 'Ok' } }],
        ListContainers: [{ name: 'web', state: 'running', status: 'Up (healthy)' }],
    });
    assert.ok(ok);
    assert.match(text, /authentification OK \(Komodo 2\.3\.0\)/);
    assert.match(text, /1 serveur\(s\) : nas \(Ok\)/);
});

test('check : clé refusée', async () => {
    const { ok, text } = await run({ GetVersion: new Error('Komodo GetVersion : HTTP 401 Unauthorized') });
    assert.equal(ok, false);
    assert.match(text, /clé API refusée/);
});

test('check : aucun serveur visible', async () => {
    const { ok, text } = await run({ GetVersion: { version: '2.3.0' }, ListServers: [] });
    assert.equal(ok, false);
    assert.match(text, /droit Read sur les serveurs/);
});
