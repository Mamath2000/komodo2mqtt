const test = require('node:test');
const assert = require('node:assert/strict');
const { containerState } = require('../src/model');
const { build } = require('../src/homeassistant');
const { loadConfig } = require('../src/config');

test('containerState', () => {
    assert.equal(containerState({ state: 'running', status: 'Up 2 hours (healthy)' }), 'healthy');
    assert.equal(containerState({ state: 'running', status: 'Up 2 hours (unhealthy)' }), 'unhealthy');
    assert.equal(containerState({ state: 'running', status: 'Up 2 hours' }), 'running');
    assert.equal(containerState({ state: 'exited', status: 'Exited (0)' }), 'stopped');
});

const model = {
    servers: [{
        id: 's1', slug: 'nas', name: 'nas', state: 'Ok',
        containers: [{ key: 'c_web', name: 'web', state: 'healthy' }],
        updates: [
            { key: 'stack_app_web', kind: 'stack', stack: 'app', service: 'web', title: 'app/web', image: 'nginx:1', latest: null, available: true },
            { key: 'deploy_db', kind: 'deployment', deployment: 'db', title: 'db', image: 'pg:16', latest: null, available: false },
        ],
    }],
};
const cfg = { topic: 'komodo2mqtt', discoveryPrefix: 'homeassistant', version: '0.1.0' };

test('build : devices, composants, commandes', () => {
    const { devices, commands } = build(model, cfg);
    assert.deepEqual(devices.map((d) => d.id), ['komodo', 'komodo_nas']);
    const srv = devices[1].discovery;
    assert.equal(srv.device.via_device, 'komodo');
    assert.deepEqual(srv.availability, [{ topic: 'komodo2mqtt/lwt' }]);
    assert.ok(srv.origin.name && srv.components.update_all && srv.components.c_web && srv.components.stack_app_web);
    assert.equal(srv.components.stack_app_web.platform, 'update');
    assert.equal(commands.get('komodo2mqtt/komodo_nas/update_all/set').updates.length, 1); // only pending ones
    assert.equal(commands.get('komodo2mqtt/komodo/update_all/set').updates.length, 1);
    assert.equal(commands.get('komodo2mqtt/komodo_nas/stack_app_web/set').payload, 'INSTALL');
});

test('loadConfig : valeurs par défaut et erreurs', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'k2m-')), 'config.conf');
    fs.writeFileSync(file, JSON.stringify({ komodo: { url: 'http://k:9120' }, mqtt: { broker: 'mqtt://b' } }));
    const env = { CONFIG_FILE: file, KOMODO_API_KEY: 'k', KOMODO_API_SECRET: 's' };
    const c = loadConfig({ env });
    assert.equal(c.interval_seconds, 60);
    assert.equal(c.mqtt.topic, 'komodo2mqtt');
    assert.equal(c.komodo.key, 'k');
    assert.throws(() => loadConfig({ env: { CONFIG_FILE: file } }), /KOMODO_API_KEY/);
});
