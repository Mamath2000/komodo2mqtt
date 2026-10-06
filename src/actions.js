const log = require('./logger');

// Recomputes the "latest" image digests of a stack (Komodo CheckStackForUpdate, Execute permission is enough).
// skip_auto_update: never triggers an auto redeploy.
function checkStack(komodo, stack) {
    return komodo.write('CheckStackForUpdate', { stack, skip_auto_update: true });
}

// After a deploy limited to some services, Komodo drops the "latest" image digests of the whole stack, so every
// service looks up to date until its next scheduled check. Ask for the check right away; never fails the update.
async function recheck(komodo, type, params, label) {
    try {
        log.debug(`${label} : contrôle des mises à jour`);
        await komodo.write(type, { ...params, skip_auto_update: true });
    } catch (e) {
        log.warn(`${label} : contrôle des mises à jour impossible (${e.message})`);
    }
}

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
        await recheck(komodo, 'CheckStackForUpdate', { stack }, `Stack ${stack}`);
    }
    for (const deployment of deployments) {
        log.info(`Deployment ${deployment} : pull`);
        await komodo.execute('PullDeployment', { deployment });
        log.info(`Deployment ${deployment} : deploy`);
        await komodo.execute('Deploy', { deployment });
        log.info(`Deployment ${deployment} : mis à jour`);
        await recheck(komodo, 'CheckDeploymentForUpdate', { deployment }, `Deployment ${deployment}`);
    }
}

module.exports = { installUpdates, checkStack };
