// ===============================
// komodo2mqtt
// ===============================
// Komodo -> MQTT -> Home Assistant (device discovery): servers, dockers, updates, "update all".
//   node src/main.js            loop (interval_seconds), states on MQTT, commands from HA
//   node src/main.js --once     single pass, no MQTT: prints what Komodo returns
const mqtt = require('mqtt');
const { version } = require('../package.json');
const { loadConfig } = require('./config');
const Komodo = require('./komodo');
const { buildModel } = require('./model');
const { build } = require('./homeassistant');
const { installUpdates, checkStack } = require('./actions');
const log = require('./logger');
const { runCheck } = require('./check');

const HA_STATUS_TOPIC = 'homeassistant/status';
const ONCE = process.argv.slice(2).includes('--once');

let config;
try {
    config = loadConfig({ args: new Set(process.argv.slice(2)) });
} catch (e) {
    log.error(`❌ Configuration : ${e.message}`);
    process.exit(1);
}
log.setLevel(config.log_level);
const komodo = new Komodo(config.komodo);
const topic = config.mqtt.topic;
const cfg = { topic, discoveryPrefix: config.discovery_prefix, version };

function loop() {
    const client = mqtt.connect(config.mqtt.broker, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        will: { topic: `${topic}/lwt`, payload: 'offline', qos: 1, retain: true },
    });
    const sent = new Map(); // topic -> last published value (no useless publication)
    const pub = (t, value) => {
        if (sent.get(t) === value) return;
        sent.set(t, value);
        log.debug(`MQTT → ${t}`, t.endsWith('/config') ? `(${value.length} octets)` : value);
        client.publish(t, value, { retain: true, qos: 1 });
    };

    let model = null;
    let commands = new Map();
    let known = new Set(); // ids of announced devices
    const busy = new Set();
    let queue = Promise.resolve();

    const render = () => {
        if (!model) return;
        const built = build(model, cfg, busy);
        commands = built.commands;
        const ids = new Set(built.devices.map((d) => d.id));
        if (config.mqtt.home_assistant_autodiscovery !== false) {
            for (const dev of built.devices) pub(dev.discoveryTopic, JSON.stringify(dev.discovery));
            for (const id of known) if (!ids.has(id)) pub(`${cfg.discoveryPrefix}/device/${id}/config`, ''); // device gone
        }
        for (const dev of built.devices) for (const [t, v] of dev.states) pub(t, v);
        for (const id of ids) if (!known.has(id)) log.info(`📟 Appareil annoncé : ${id}`);
        for (const id of known) if (!ids.has(id)) log.info(`📟 Appareil retiré : ${id}`);
        known = ids;
    };

    let summary = '';
    let apiDown = false;
    const refresh = async () => {
        const t0 = Date.now();
        try {
            model = await buildModel(komodo);
            const dockers = model.servers.reduce((n, s) => n + s.containers.length, 0);
            const updates = model.servers.reduce((n, s) => n + s.updates.filter((u) => u.available).length, 0);
            const now = `${model.servers.length} serveur(s), ${dockers} docker(s), ${updates} mise(s) à jour disponible(s), ${model.alerts ? model.alerts.length : '?'} alerte(s)`;
            if (now !== summary) log.info(`🔄 Komodo : ${now}`);
            summary = now;
            log.debug(`Lecture Komodo terminée (${Date.now() - t0} ms)`);
            if (apiDown) log.info('✅ Komodo de nouveau joignable');
            apiDown = false;
            render();
            pub(`${topic}/api`, 'ON');
        } catch (e) {
            if (!apiDown) log.warn(`⚠️  Komodo injoignable ou en erreur : ${e.message}`);
            else log.debug(`Komodo toujours en erreur : ${e.message}`);
            apiDown = true;
            pub(`${topic}/api`, 'OFF');
        }
    };

    client.on('connect', () => {
        log.info('📡 Connecté au broker MQTT');
        sent.clear();
        client.publish(`${topic}/lwt`, 'online', { retain: true, qos: 1 });
        client.subscribe([HA_STATUS_TOPIC, `${topic}/+/+/set`]);
        render();
    });
    client.on('error', (e) => log.error(`❌ MQTT : ${e.message}`));
    client.on('message', (t, message, packet) => {
        if (t === HA_STATUS_TOPIC) {
            if (message.toString() === 'online' && !packet.retain) {
                log.info('🏠 Home Assistant redémarré : republication');
                sent.clear();
                render();
            }
            return;
        }
        const cmd = commands.get(t);
        log.debug(`MQTT ← ${t}`, message.toString());
        if (!cmd || message.toString() !== cmd.payload) return log.debug('Commande ignorée (topic ou payload inconnu)');
        if (cmd.check) {
            log.info(`🔍 Recalcul des digests demandé : stack ${cmd.check.stack}`);
            queue = queue.then(async () => {
                try {
                    await checkStack(komodo, cmd.check.stack);
                    log.info(`✅ Digests recalculés : stack ${cmd.check.stack}`);
                } catch (e) {
                    log.error(`❌ Recalcul des digests (${cmd.check.stack}) : ${e.message}`);
                }
                await refresh();
            });
            return;
        }
        if (!cmd.updates.length) return log.info('Rien à mettre à jour');
        const { updates } = cmd;
        log.info(`⬆  Mise à jour demandée : ${updates.map((u) => u.title).join(', ')}`);
        queue = queue.then(async () => {
            updates.forEach((u) => busy.add(u.key));
            render();
            try {
                await installUpdates(komodo, updates);
                log.info('✅ Mise à jour terminée');
            } catch (e) {
                log.error(`❌ Mise à jour : ${e.message}`);
            } finally {
                updates.forEach((u) => busy.delete(u.key));
                await refresh();
            }
        });
    });

    const shutdown = (reason) => {
        log.info(`🛑 Arrêt (${reason})`);
        client.publish(`${topic}/lwt`, 'offline', { retain: true, qos: 1 }, () => client.end(false, () => process.exit(0)));
        setTimeout(() => process.exit(0), 1000);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    const tick = async () => {
        await refresh();
        setTimeout(tick, config.interval_seconds * 1000);
    };
    log.info(`🚀 komodo2mqtt ${version} : ${config.komodo.url}, toutes les ${config.interval_seconds} s, logs ${config.log_level}`);
    tick();
}

if (ONCE) {
    runCheck(komodo).then((ok) => process.exit(ok ? 0 : 1)).catch((e) => {
        log.error(`❌ ${e.message}`);
        process.exit(1);
    });
} else {
    loop();
}
