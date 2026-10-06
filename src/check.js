// `--once` / `make check`: connection test, server list test, then what the bridge would publish.
const { buildModel } = require('./model');

const hint = (e) => {
    if (/HTTP 40[13]/.test(e.message)) return 'clé API refusée : vérifier KOMODO_API_KEY / KOMODO_API_SECRET';
    if (/ECONNREFUSED|ENOTFOUND|fetch failed|timeout|aborted/i.test(`${e.message} ${e.cause?.code ?? ''}`)) return 'Komodo injoignable : vérifier komodo.url et le réseau';
    return null;
};

// Returns true when everything is fine.
async function runCheck(komodo, out = console.log) {
    out(`1/3 Connexion à Komodo (${komodo.url})`);
    try {
        const { version } = await komodo.read('GetVersion');
        out(`    ✅ connexion et authentification OK (Komodo ${version})`);
    } catch (e) {
        out(`    ❌ ${e.message}`);
        const h = hint(e);
        if (h) out(`       → ${h}`);
        return false;
    }

    out('2/3 Liste des serveurs');
    let servers;
    try {
        servers = await komodo.list('ListServers');
    } catch (e) {
        out(`    ❌ ${e.message}`);
        return false;
    }
    if (!servers.length) {
        // same request without the pagination parameter: tells a permission problem from a pagination one
        const plain = await komodo.read('ListServers').catch(() => []);
        if (plain.length) {
            out(`    ⚠️  ListServers renvoie ${plain.length} serveur(s) sans le paramètre « limit » mais 0 avec : problème de pagination de cette version de Komodo`);
            return false;
        }
        out('    ⚠️  aucun serveur renvoyé, avec ou sans pagination : l\'utilisateur de la clé API n\'a probablement le droit Read sur aucun serveur (Komodo ne liste que les ressources autorisées)');
        return false;
    }
    out(`    ✅ ${servers.length} serveur(s) : ${servers.map((s) => `${s.name} (${s.info?.state ?? '?'})`).join(', ')}`);

    out('3/3 Dockers et mises à jour');
    let ok = true;
    try {
        const model = await buildModel(komodo);
        for (const s of model.servers) {
            out(`🖥  ${s.name} (${s.state}) : ${s.containers.length} docker(s), ${s.updates.length} élément(s) mettable(s) à jour`);
            if (s.state !== 'Ok') ok = false;
            for (const c of s.containers) out(`    ${c.state.padEnd(10)} ${c.name}`);
            for (const u of s.updates) out(`    ${u.available ? '⬆ ' : '✓ '} ${u.kind.padEnd(10)} ${u.title} (${u.image})`);
        }
    } catch (e) {
        out(`    ❌ ${e.message}`);
        return false;
    }
    return ok;
}

module.exports = { runCheck };
