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

  execute(type, params) {
    return this.call('execute', type, params);
  }
}
