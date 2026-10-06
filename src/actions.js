const log = require('./logger');

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
        log.info(`Stack ${stack} (${services.join(', ')}) : pull`);
        await komodo.execute('PullStack', { stack, services });
        log.info(`Stack ${stack} (${services.join(', ')}) : deploy`);
        await komodo.execute('DeployStack', { stack, services });
        log.info(`Stack ${stack} : mis à jour`);
    }
    for (const deployment of deployments) {
        log.info(`Deployment ${deployment} : pull`);
        await komodo.execute('PullDeployment', { deployment });
        log.info(`Deployment ${deployment} : deploy`);
        await komodo.execute('Deploy', { deployment });
        log.info(`Deployment ${deployment} : mis à jour`);
    }
}

module.exports = { installUpdates };
