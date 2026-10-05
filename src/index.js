import mqtt from 'mqtt';
import { readFileSync } from 'node:fs';
import { Komodo } from './komodo.js';
import { buildModel } from './model.js';
import { build } from './ha.js';
import { installUpdates } from './actions.js';

const env = process.env;
const need = (k) => {
  if (!env[k]) {
    console.error(`Variable d'environnement manquante : ${k}`);
    process.exit(1);
  }
  return env[k];
};

const cfg = {
  version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version,
  baseTopic: env.BASE_TOPIC || 'komodo2mqtt',
  discoveryPrefix: env.DISCOVERY_PREFIX || 'homeassistant',
  pollMs: Number(env.POLL_INTERVAL || 60) * 1000,
};
const komodo = new Komodo({ url: need('KOMODO_URL'), key: need('KOMODO_API_KEY'), secret: need('KOMODO_API_SECRET') });
const statusTopic = `${cfg.baseTopic}/status`;

const client = mqtt.connect(need('MQTT_URL'), {
  username: env.MQTT_USER || undefined,
  password: env.MQTT_PASS || undefined,
  reconnectPeriod: 5000,
  will: { topic: statusTopic, payload: 'offline', retain: true },
});

const cache = new Map(); // topic -> dernière valeur publiée (évite les publications inutiles)
const pub = (topic, value) => {
  if (cache.get(topic) === value) return;
  cache.set(topic, value);
  client.publish(topic, value, { retain: true });
};

let model = null;
let commands = new Map();
let known = new Set(); // ids des devices annoncés
const busy = new Set();
let queue = Promise.resolve();

function render() {
  if (!model) return;
  const built = build(model, cfg, busy);
  commands = built.commands;
  for (const dev of built.devices) {
    pub(dev.discoveryTopic, JSON.stringify(dev.discovery));
    for (const [topic, value] of dev.states) pub(topic, value);
  }
  const ids = new Set(built.devices.map((d) => d.id));
  for (const id of known) {
    if (!ids.has(id)) pub(`${cfg.discoveryPrefix}/device/${id}/config`, ''); // device disparu
  }
  known = ids;
}

async function refresh() {
  try {
    model = await buildModel(komodo);
    render();
    pub(`${cfg.baseTopic}/api`, 'ON');
  } catch (e) {
    console.error(`Poll Komodo : ${e.message}`);
    pub(`${cfg.baseTopic}/api`, 'OFF');
  }
}

async function poll() {
  await refresh();
  setTimeout(poll, cfg.pollMs);
}

client.on('connect', () => {
  console.log('MQTT connecté');
  cache.clear();
  client.publish(statusTopic, 'online', { retain: true });
  client.subscribe([`${cfg.baseTopic}/+/+/set`, `${cfg.discoveryPrefix}/status`]);
  render();
});
client.on('error', (e) => console.error(`MQTT : ${e.message}`));

client.on('message', (topic, buf) => {
  if (topic === `${cfg.discoveryPrefix}/status`) {
    if (buf.toString() === 'online') {
      cache.clear(); // HA redémarre : on republie tout
      render();
    }
    return;
  }
  const cmd = commands.get(topic);
  if (!cmd || buf.toString() !== cmd.payload) return;
  const updates = cmd.updates;
  if (!updates.length) return;
  console.log(`Mise à jour : ${updates.map((u) => u.title).join(', ')}`);
  queue = queue.then(async () => {
    updates.forEach((u) => busy.add(u.key));
    render();
    try {
      await installUpdates(komodo, updates);
    } catch (e) {
      console.error(`Update : ${e.message}`);
    } finally {
      updates.forEach((u) => busy.delete(u.key));
      await refresh();
    }
  });
});

function stop() {
  client.publish(statusTopic, 'offline', { retain: true }, () => client.end(false, () => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

poll();
