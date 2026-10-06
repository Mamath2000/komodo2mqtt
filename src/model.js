const log = require('./logger');
// Builds a simple model { servers: [...] } from the Komodo API.
const slug = (s) =>
    String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// running / healthy / unhealthy / starting / stopped / restarting / paused ...
function containerState(c) {
    const state = String(c.state ?? '').toLowerCase();
    const status = String(c.status ?? '').toLowerCase();
    if (state === 'running') {
        if (status.includes('unhealthy')) return 'unhealthy';
        if (status.includes('health: starting')) return 'starting';
        if (status.includes('healthy')) return 'healthy';
        return 'running';
    }
    if (state === 'exited' || state === 'dead' || state === 'created') return 'stopped';
    return state || 'unknown';
}

// ListContainers (Komodo >= 2.3), ListDockerContainers before.
async function listContainers(komodo, server) {
    try {
        return await komodo.read('ListContainers', { server });
    } catch (e) {
        log.debug(`ListContainers indisponible (${e.message}) : essai de ListDockerContainers`);
        return komodo.read('ListDockerContainers', { server });
    }
}

// Open (unresolved) alerts. Komodo only returns alerts of resources the API user can read.
// null = could not be read (the alert entities are then left out rather than showing a false 0).
async function listOpenAlerts(komodo) {
    try {
        const alerts = [];
        for (let page = 0; page < 5; page++) { // 100 per page
            const res = await komodo.read('ListAlerts', { query: { resolved: false }, page });
            alerts.push(...res.alerts.filter((a) => !a.resolved));
            if (res.next_page == null) break;
        }
        return alerts;
    } catch (e) {
        log.warn(`ListAlerts : ${e.message}`);
        return null;
    }
}

async function buildModel(komodo) {
    const [servers, stacks, deployments] = await Promise.all([
        komodo.list('ListServers'),
        komodo.list('ListStacks'),
        komodo.list('ListDeployments'),
    ]);

    const rawAlerts = await listOpenAlerts(komodo);
    const serverOf = new Map(); // "Stack:<id>" -> server id
    for (const st of stacks) serverOf.set(`Stack:${st.id}`, st.info?.server_id);
    for (const d of deployments) serverOf.set(`Deployment:${d.id}`, d.info?.server_id);
    const names = new Map([
        ...servers.map((x) => [`Server:${x.id}`, x.name]),
        ...stacks.map((x) => [`Stack:${x.id}`, x.name]),
        ...deployments.map((x) => [`Deployment:${x.id}`, x.name]),
    ]);
    const alerts = rawAlerts && rawAlerts.map((a) => {
        const key = `${a.target?.type}:${a.target?.id}`;
        return {
            level: a.level,
            kind: a.data?.type ?? 'Unknown',
            target: names.get(key) ? `${a.target.type} ${names.get(key)}` : String(a.target?.type ?? ''),
            since: a.ts ? new Date(a.ts).toISOString() : null,
            server: a.target?.type === 'Server' ? a.target.id : serverOf.get(key) ?? null,
        };
    });

    const out = [];
    for (const s of servers) {
        const state = s.info?.state ?? 'Unknown';
        let containers = [];
        if (state === 'Ok') {
            try {
                containers = (await listContainers(komodo, s.id)).map((c) => ({
                    key: `c_${slug(c.name)}`,
                    name: c.name,
                    state: containerState(c),
                }));
            } catch (e) {
                log.warn(`ListContainers ${s.name} : ${e.message}`);
            }
        }

        const updates = [];
        for (const st of stacks.filter((x) => x.info?.server_id === s.id)) {
            for (const svc of st.info?.services ?? []) {
                updates.push({
                    key: `stack_${slug(st.name)}_${slug(svc.service)}`,
                    kind: 'stack',
                    stack: st.name,
                    service: svc.service,
                    title: `${st.name}/${svc.service}`,
                    image: svc.image || svc.service,
                    latest: svc.latest_image || null,
                    available: !!svc.update_available,
                });
            }
        }
        for (const d of deployments.filter((x) => x.info?.server_id === s.id)) {
            updates.push({
                key: `deploy_${slug(d.name)}`,
                kind: 'deployment',
                deployment: d.name,
                title: d.name,
                image: d.info?.image || d.name,
                latest: null,
                available: !!d.info?.update_available,
            });
        }

        const own = alerts ? alerts.filter((a) => a.server === s.id) : null;
        out.push({ id: s.id, slug: slug(s.name), name: s.name, state, containers, updates, alerts: own });
    }
    return { servers: out, alerts };
}

module.exports = { slug, containerState, buildModel };
