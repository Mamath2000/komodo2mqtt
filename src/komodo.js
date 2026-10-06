// Minimal client for the Komodo HTTP API (POST /read and POST /execute).
const log = require('./logger');

class Komodo {
    constructor({ url, key, secret }) {
        this.url = url.replace(/\/+$/, '');
        this.headers = { 'content-type': 'application/json', 'x-api-key': key, 'x-api-secret': secret };
    }

    async call(path, type, params = {}) {
        const t0 = Date.now();
        const res = await fetch(`${this.url}/${path}`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ type, params }),
            signal: AbortSignal.timeout(30_000),
        });
        log.debug(`Komodo ${path}/${type}`, params, `→ HTTP ${res.status} (${Date.now() - t0} ms)`);
        if (!res.ok) throw new Error(`Komodo ${type} : HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
        return res.json();
    }

    read(type, params) {
        return this.call('read', type, params);
    }

    // /write: only used for CheckStackForUpdate / CheckDeploymentForUpdate (Execute is enough, no config is modified).
    write(type, params) {
        return this.call('write', type, params);
    }

    // Komodo lists are paginated (30 by default): limit 0 = everything.
    list(type, params = {}) {
        return this.read(type, { ...params, limit: 0 });
    }

    // /execute returns the Update right away (the operation goes on in Core):
    // wait for it to complete so that operations can be chained (pull then deploy).
    async execute(type, params, { timeoutMs = 15 * 60_000 } = {}) {
        let cur = await this.call('execute', type, params);
        const id = cur._id?.$oid ?? cur.id;
        const deadline = Date.now() + timeoutMs;
        while (cur.status !== 'Complete') {
            if (Date.now() > deadline) throw new Error(`${type} : délai dépassé`);
            await new Promise((r) => setTimeout(r, 2000));
            cur = await this.read('GetUpdate', { id });
            log.debug(`${type} : Update ${id} ${cur.status}`);
        }
        if (!cur.success) throw new Error(`${type} ${JSON.stringify(params)} : échec (voir les Updates de Komodo)`);
        return cur;
    }
}

module.exports = Komodo;
