// Client minimal de l'API HTTP Komodo (POST /read et POST /execute).
export class Komodo {
  constructor({ url, key, secret }) {
    this.url = url.replace(/\/+$/, '');
    this.headers = {
      'content-type': 'application/json',
      'x-api-key': key,
      'x-api-secret': secret,
    };
  }

  async call(path, type, params = {}) {
    const res = await fetch(`${this.url}/${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ type, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Komodo ${type}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }

  read(type, params) {
    return this.call('read', type, params);
  }

  // Les listes Komodo sont paginées (30 par défaut) : limit 0 = tout.
  list(type, params = {}) {
    return this.read(type, { ...params, limit: 0 });
  }

  // /execute rend l'Update tout de suite (l'opération continue côté Core) :
  // on attend sa fin pour pouvoir enchaîner (pull puis deploy).
  async execute(type, params, { timeoutMs = 15 * 60_000 } = {}) {
    const update = await this.call('execute', type, params);
    const id = update._id?.$oid ?? update.id;
    const deadline = Date.now() + timeoutMs;
    let cur = update;
    while (cur.status !== 'Complete') {
      if (Date.now() > deadline) throw new Error(`${type}: délai dépassé`);
      await new Promise((r) => setTimeout(r, 2000));
      cur = await this.read('GetUpdate', { id });
    }
    if (!cur.success) throw new Error(`${type} ${JSON.stringify(params)} : échec (voir les Updates Komodo)`);
    return cur;
  }
}
