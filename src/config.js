// config.conf (JSON) + secrets from the environment (.env): KOMODO_API_KEY / KOMODO_API_SECRET.
const fs = require('fs');
const path = require('path');
const { LEVELS } = require('./logger');

function loadConfig({ env = process.env, args = new Set(), dir = __dirname } = {}) {
    const configPath = env.CONFIG_FILE || path.join(dir, '../config.conf');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const url = env.KOMODO_URL || config.komodo?.url;
    if (!url) throw new Error('config.conf : « komodo.url » (ou KOMODO_URL) requis');
    if (!env.KOMODO_API_KEY || !env.KOMODO_API_SECRET) throw new Error('KOMODO_API_KEY et KOMODO_API_SECRET requis (.env)');
    config.komodo = { url, key: env.KOMODO_API_KEY, secret: env.KOMODO_API_SECRET };
    if (!args.has('--once') && !config.mqtt?.broker) throw new Error('config.conf : « mqtt.broker » requis');
    config.mqtt = {
        topic: 'komodo2mqtt',
        home_assistant_autodiscovery: true,
        username: env.MQTT_USER || undefined,
        password: env.MQTT_PASS || undefined,
        ...config.mqtt,
    };
    config.discovery_prefix ||= 'homeassistant';
    config.interval_seconds ||= 60;
    config.log_level = args.has('--debug') ? 'debug' : env.LOG_LEVEL || config.log_level || 'info';
    if (!(config.log_level in LEVELS)) throw new Error(`log_level « ${config.log_level} » inconnu (${Object.keys(LEVELS).join(', ')})`);
    return config;
}

module.exports = { loadConfig };
