// Updates run by Komodo: pull then (re)deploy, one after the other.
async function installUpdates(komodo, updates) {
    const stacks = new Map(); // stack -> [services]
    const deployments = [];
    for (const u of updates) {
        if (u.kind === 'stack') {
            if (!stacks.has(u.stack)) stacks.set(u.stack, []);
            stacks.get(u.stack).push(u.service);
        } else {
            deployments.push(u.deployment);
        }
    }
    for (const [stack, services] of stacks) {
        await komodo.execute('PullStack', { stack, services });
        await komodo.execute('DeployStack', { stack, services });
    }
    for (const deployment of deployments) {
        await komodo.execute('PullDeployment', { deployment });
        await komodo.execute('Deploy', { deployment });
    }
}

module.exports = { installUpdates };
