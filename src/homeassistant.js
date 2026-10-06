// ===============================
// Home Assistant device discovery (device-based format) + states
// ===============================
// One device per Komodo (root) and per server. Retained topics:
//   <topic>/lwt (online/offline), <topic>/api (ON/OFF), <topic>/<device>/<key>/state, <topic>/<device>/<key>/set (commands)
const INSTALL = 'INSTALL';
const PRESS = 'PRESS';

function build(model, { topic, discoveryPrefix, version }, busy = new Set()) {
    const devices = [];
    const commands = new Map(); // topic -> { payload, updates }
    const availability = [{ topic: `${topic}/lwt` }];
    const origin = { name: 'komodo2mqtt', sw_version: version, support_url: 'https://github.com/Mamath2000/komodo2mqtt' };

    function device(id, name, via) {
        const t = (key, suffix = 'state') => `${topic}/${id}/${key}/${suffix}`;
        const dev = { id, discoveryTopic: `${discoveryPrefix}/device/${id}/config`, states: [], components: {} };
        const add = (key, platform, name, extra) => {
            dev.components[key] = { platform, unique_id: `${id}_${key}`, name, ...extra };
        };

        dev.sensor = (key, label, value, extra = {}) => {
            add(key, 'sensor', label, { state_topic: t(key), ...extra });
            dev.states.push([t(key), String(value)]);
        };
        // list = open alerts (null: not readable, no entity). Count + "problem" flag, details as attributes.
        dev.alerts = (list) => {
            if (!list) return;
            add('alerts', 'sensor', 'Alertes ouvertes', {
                state_topic: t('alerts'), json_attributes_topic: t('alerts', 'attributes'), icon: 'mdi:alert-outline',
            });
            dev.states.push([t('alerts'), String(list.length)]);
            dev.states.push([t('alerts', 'attributes'), JSON.stringify({
                critical: list.filter((a) => a.level === 'CRITICAL').length,
                alerts: list.slice(0, 10).map(({ level, kind, target, since }) => ({ level, kind, target, since })),
            })]);
            add('problem', 'binary_sensor', 'Problème', {
                state_topic: t('problem'), payload_on: 'ON', payload_off: 'OFF', device_class: 'problem',
            });
            dev.states.push([t('problem'), list.length ? 'ON' : 'OFF']);
        };
        dev.apiSensor = () => {
            add('api', 'binary_sensor', 'API Komodo', {
                state_topic: `${topic}/api`, payload_on: 'ON', payload_off: 'OFF', device_class: 'connectivity', availability: [],
            });
        };
        dev.button = (key, label, updates) => {
            add(key, 'button', label, { command_topic: t(key, 'set'), payload_press: PRESS, device_class: 'update' });
            commands.set(t(key, 'set'), { payload: PRESS, updates });
        };
        dev.checkButton = (key, stack) => {
            add(key, 'button', `Vérifier ${stack}`, { command_topic: t(key, 'set'), payload_press: PRESS, icon: 'mdi:refresh' });
            commands.set(t(key, 'set'), { payload: PRESS, updates: [], check: { stack } });
        };
        dev.update = (u) => {
            add(u.key, 'update', u.title, { state_topic: t(u.key), command_topic: t(u.key, 'set'), payload_install: INSTALL });
            dev.states.push([t(u.key), JSON.stringify({
                installed_version: u.image,
                latest_version: u.available ? u.latest || `${u.image} (maj disponible)` : u.image,
                title: u.title,
                in_progress: busy.has(u.key),
            })]);
            commands.set(t(u.key, 'set'), { payload: INSTALL, updates: [u] });
        };
        dev.finish = () => {
            dev.discovery = {
                device: { identifiers: [id], name, manufacturer: 'Komodo', model: via ? 'Server' : 'Core', ...(via ? { via_device: via } : {}) },
                origin,
                availability,
                components: dev.components,
            };
            devices.push(dev);
        };
        return dev;
    }

    const active = (cs) => cs.filter((c) => ['running', 'healthy'].includes(c.state)).length;
    const pending = model.servers.flatMap((s) => s.updates).filter((u) => u.available);
    const containers = model.servers.flatMap((s) => s.containers);

    const root = device('komodo', 'Komodo');
    root.sensor('servers', 'Serveurs', model.servers.length, { icon: 'mdi:server' });
    root.sensor('containers', 'Dockers', containers.length, { icon: 'mdi:docker' });
    root.sensor('running', 'Dockers actifs', active(containers), { icon: 'mdi:docker' });
    root.sensor('updates', 'Mises à jour disponibles', pending.length, { icon: 'mdi:package-up' });
    root.alerts(model.alerts);
    root.apiSensor();
    root.button('update_all', 'Tout mettre à jour', pending);
    root.finish();

    for (const s of model.servers) {
        const todo = s.updates.filter((u) => u.available);
        const d = device(`komodo_${s.slug}`, s.name, 'komodo');
        d.sensor('state', 'État', s.state, { icon: 'mdi:server' });
        d.sensor('containers', 'Dockers', s.containers.length, { icon: 'mdi:docker' });
        d.sensor('running', 'Dockers actifs', active(s.containers), { icon: 'mdi:docker' });
        d.sensor('updates', 'Mises à jour disponibles', todo.length, { icon: 'mdi:package-up' });
        d.alerts(s.alerts);
        d.button('update_all', 'Tout mettre à jour', todo);
        for (const c of s.containers) d.sensor(c.key, c.name, c.state, { icon: 'mdi:docker' });
        for (const st of s.stacks ?? []) d.checkButton(st.key, st.name);
        for (const u of s.updates) d.update(u);
        d.finish();
    }
    return { devices, commands };
}

module.exports = { build };
