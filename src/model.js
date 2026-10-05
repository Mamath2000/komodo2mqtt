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
        return komodo.read('ListDockerContainers', { server });
    }
}

async function buildModel(komodo) {
    const [servers, stacks, deployments] = await Promise.all([
        komodo.list('ListServers'),
        komodo.list('ListStacks'),
        komodo.list('ListDeployments'),
    ]);

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
                console.error(`ListContainers ${s.name}: ${e.message}`);
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

        out.push({ id: s.id, slug: slug(s.name), name: s.name, state, containers, updates });
    }
    return { servers: out };
}

module.exports = { slug, containerState, buildModel };
