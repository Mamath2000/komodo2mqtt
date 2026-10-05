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
const { installUpdates } = require('./actions');

const HA_STATUS_TOPIC = 'homeassistant/status';
const ONCE = process.argv.slice(2).includes('--once');

let config;
try {
    config = loadConfig({ args: new Set(process.argv.slice(2)) });
} catch (e) {
    console.error(`❌ Configuration : ${e.message}`);
    process.exit(1);
}
const komodo = new Komodo(config.komodo);
const topic = config.mqtt.topic;
const cfg = { topic, discoveryPrefix: config.discovery_prefix, version };

async function once() {
    const model = await buildModel(komodo);
    for (const s of model.servers) {
        console.log(`🖥  ${s.name} (${s.state}) : ${s.containers.length} docker(s)`);
        for (const c of s.containers) console.log(`    ${c.state.padEnd(10)} ${c.name}`);
        for (const u of s.updates) console.log(`    ${u.available ? '⬆ ' : '✓ '} ${u.kind.padEnd(10)} ${u.title} (${u.image})`);
    }
}

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
        known = ids;
    };

    const refresh = async () => {
        try {
            model = await buildModel(komodo);
            render();
            pub(`${topic}/api`, 'ON');
        } catch (e) {
            console.error(`❌ Komodo : ${e.message}`);
            pub(`${topic}/api`, 'OFF');
        }
    };

    client.on('connect', () => {
        console.log('📡 Connecté au broker MQTT');
        sent.clear();
        client.publish(`${topic}/lwt`, 'online', { retain: true, qos: 1 });
        client.subscribe([HA_STATUS_TOPIC, `${topic}/+/+/set`]);
        render();
    });
    client.on('error', (e) => console.error(`❌ MQTT : ${e.message}`));
    client.on('message', (t, message, packet) => {
        if (t === HA_STATUS_TOPIC) {
            if (message.toString() === 'online' && !packet.retain) {
                console.log('🏠 Home Assistant redémarré : republication');
                sent.clear();
                render();
            }
            return;
        }
        const cmd = commands.get(t);
        if (!cmd || message.toString() !== cmd.payload || !cmd.updates.length) return;
        const { updates } = cmd;
        console.log(`⬆  Mise à jour : ${updates.map((u) => u.title).join(', ')}`);
        queue = queue.then(async () => {
            updates.forEach((u) => busy.add(u.key));
            render();
            try {
                await installUpdates(komodo, updates);
            } catch (e) {
                console.error(`❌ Mise à jour : ${e.message}`);
            } finally {
                updates.forEach((u) => busy.delete(u.key));
                await refresh();
            }
        });
    });

    const shutdown = (reason) => {
        console.log(`🛑 Arrêt (${reason})`);
        client.publish(`${topic}/lwt`, 'offline', { retain: true, qos: 1 }, () => client.end(false, () => process.exit(0)));
        setTimeout(() => process.exit(0), 1000);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    const tick = async () => {
        await refresh();
        setTimeout(tick, config.interval_seconds * 1000);
    };
    console.log(`🚀 komodo2mqtt ${version} : ${config.komodo.url}, toutes les ${config.interval_seconds} s`);
    tick();
}

if (ONCE) {
    once().catch((e) => {
        console.error(`❌ ${e.message}`);
        process.exit(1);
    });
} else {
    loop();
}
