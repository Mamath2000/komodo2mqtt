const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel } = require('../src/model');
const { build } = require('../src/homeassistant');

const komodo = (alerts) => ({
    list: async (type) => ({
        ListServers: [{ id: 's1', name: 'nas', info: { state: 'Ok' } }, { id: 's2', name: 'vps', info: { state: 'Ok' } }],
        ListStacks: [{ id: 'st1', name: 'app', info: { server_id: 's1', services: [] } }],
        ListDeployments: [],
    }[type]),
    read: async (type, p) => {
        if (type === 'ListContainers') return [];
        if (type === 'ListAlerts') {
            if (alerts instanceof Error) throw alerts;
            assert.deepEqual(p.query, { resolved: false });
            return { alerts, next_page: null };
        }
    },
});

const alerts = [
    { level: 'CRITICAL', resolved: false, ts: 1700000000000, target: { type: 'Server', id: 's1' }, data: { type: 'ServerUnreachable', data: {} } },
    { level: 'WARNING', resolved: false, ts: 1700000001000, target: { type: 'Stack', id: 'st1' }, data: { type: 'StackImageUpdateAvailable', data: {} } },
    { level: 'WARNING', resolved: false, ts: 1700000002000, target: { type: 'Build', id: 'b1' }, data: { type: 'BuildFailed', data: {} } },
    { level: 'OK', resolved: true, target: { type: 'Server', id: 's2' }, data: { type: 'ServerCpu', data: {} } },
];
const cfg = { topic: 'k', discoveryPrefix: 'homeassistant', version: '0' };

test('alertes : rattachées au serveur (directement ou via stack), résolues ignorées', async () => {
    const m = await buildModel(komodo(alerts));
    assert.equal(m.alerts.length, 3);
    assert.equal(m.servers[0].alerts.length, 2); // Server s1 + Stack st1 -> s1
    assert.equal(m.servers[1].alerts.length, 0);
    assert.equal(m.servers[0].alerts[0].target, 'Server nas');
});

test('alertes : entités HA (compteur, problème, attributs)', async () => {
    const { devices } = build(await buildModel(komodo(alerts)), cfg);
    const root = devices[0];
    assert.equal(root.discovery.components.alerts.platform, 'sensor');
    assert.equal(root.discovery.components.problem.device_class, 'problem');
    assert.deepEqual(root.states.find(([t]) => t === 'k/komodo/alerts/state'), ['k/komodo/alerts/state', '3']);
    assert.deepEqual(root.states.find(([t]) => t === 'k/komodo/problem/state')[1], 'ON');
    const attrs = JSON.parse(root.states.find(([t]) => t.endsWith('alerts/attributes'))[1]);
    assert.equal(attrs.critical, 1);
    assert.equal(devices[2].states.find(([t]) => t.endsWith('/problem/state'))[1], 'OFF');
});

test('alertes illisibles : pas d\'entité plutôt qu\'un faux 0', async () => {
    const m = await buildModel(komodo(new Error('HTTP 403')));
    assert.equal(m.alerts, null);
    const { devices } = build(m, cfg);
    assert.equal(devices[0].discovery.components.alerts, undefined);
    assert.equal(devices[1].discovery.components.problem, undefined);
});
