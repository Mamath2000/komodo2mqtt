const test = require('node:test');
const assert = require('node:assert/strict');
const { installUpdates } = require('../src/actions');

function fakeKomodo({ failCheck = false } = {}) {
    const calls = [];
    return {
        calls,
        execute: async (type, params) => calls.push([type, params]),
        write: async (type, params) => {
            calls.push([type, params]);
            if (failCheck) throw new Error('HTTP 403');
        },
    };
}

test('stack : pull, deploy puis contrôle des mises à jour', async () => {
    const k = fakeKomodo();
    await installUpdates(k, [
        { kind: 'stack', stack: 'tm', service: 'db' },
        { kind: 'stack', stack: 'tm', service: 'grafana' },
    ]);
    assert.deepEqual(k.calls, [
        ['PullStack', { stack: 'tm', services: ['db', 'grafana'] }],
        ['DeployStack', { stack: 'tm', services: ['db', 'grafana'] }],
        ['CheckStackForUpdate', { stack: 'tm', skip_auto_update: true }],
    ]);
});

test('deployment : pull, deploy puis contrôle', async () => {
    const k = fakeKomodo();
    await installUpdates(k, [{ kind: 'deployment', deployment: 'web' }]);
    assert.deepEqual(k.calls.map(([t]) => t), ['PullDeployment', 'Deploy', 'CheckDeploymentForUpdate']);
    assert.deepEqual(k.calls[2][1], { deployment: 'web', skip_auto_update: true });
});

test('un échec du contrôle ne fait pas échouer la mise à jour', async () => {
    const k = fakeKomodo({ failCheck: true });
    await installUpdates(k, [{ kind: 'stack', stack: 'tm', service: 'db' }, { kind: 'deployment', deployment: 'web' }]);
    assert.equal(k.calls.filter(([t]) => t.startsWith('Check')).length, 2);
});

test('checkStack : appel /write sans auto-update', async () => {
    const { checkStack } = require('../src/actions');
    const k = fakeKomodo();
    await checkStack(k, 'tm');
    assert.deepEqual(k.calls, [['CheckStackForUpdate', { stack: 'tm', skip_auto_update: true }]]);
});
