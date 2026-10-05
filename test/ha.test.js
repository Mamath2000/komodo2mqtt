import test from 'node:test';
import assert from 'node:assert/strict';
import { containerState } from '../src/model.js';
import { build } from '../src/ha.js';

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
      { key: 'stack_app_web', kind: 'stack', stack: 'app', service: 'web', title: 'app/web', image: 'nginx:1', available: true },
      { key: 'deploy_db', kind: 'deployment', deployment: 'db', title: 'db', image: 'pg:16', available: false },
    ],
  }],
};
const cfg = { baseTopic: 'komodo2mqtt', discoveryPrefix: 'homeassistant', version: '0.1.0' };

test('build : devices, composants, commandes', () => {
  const { devices, commands } = build(model, cfg);
  assert.deepEqual(devices.map((d) => d.id), ['komodo', 'komodo_nas']);
  const srv = devices[1].discovery;
  assert.equal(srv.dev.via_device, 'komodo');
  assert.ok(srv.o.name && srv.cmps.update_all && srv.cmps.c_web && srv.cmps.stack_app_web);
  assert.equal(srv.cmps.stack_app_web.p, 'update');
  const t = 'komodo2mqtt/komodo_nas/update_all/set';
  assert.equal(commands.get(t).updates.length, 1); // seulement celles disponibles
  assert.equal(commands.get('komodo2mqtt/komodo/update_all/set').updates.length, 1);
  assert.equal(commands.get('komodo2mqtt/komodo_nas/stack_app_web/set').payload, 'INSTALL');
});
