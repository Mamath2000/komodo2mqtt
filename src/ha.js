// Génère, à partir du modèle, les messages de discovery HA (format "device-based")
// et les états à publier.
const INSTALL = 'INSTALL';
const PRESS = 'PRESS';

export function build(model, cfg, busy = new Set()) {
  const b = cfg.baseTopic;
  const devices = [];
  const commands = new Map(); // topic -> { updates: [...] }

  const origin = { name: 'komodo2mqtt', sw: cfg.version, url: 'https://github.com/Mamath2000/komodo2mqtt' };

  function device(id, name, via) {
    const dev = { id, discoveryTopic: `${cfg.discoveryPrefix}/device/${id}/config`, states: [], cmps: {} };
    const t = (key, suffix = 'state') => `${b}/${id}/${key}/${suffix}`;
    const common = { availability_topic: `${b}/status` };

    dev.sensor = (key, label, value, extra = {}) => {
      dev.cmps[key] = { p: 'sensor', unique_id: `${id}_${key}`, name: label, state_topic: t(key), ...common, ...extra };
      dev.states.push([t(key), String(value)]);
    };
    dev.apiSensor = () => {
      dev.cmps.api = {
        p: 'binary_sensor', unique_id: `${id}_api`, name: 'API Komodo', device_class: 'connectivity',
        state_topic: `${b}/api`, payload_on: 'ON', payload_off: 'OFF', availability_topic: `${b}/status`,
      };
    };
    dev.button = (key, label, updates) => {
      dev.cmps[key] = { p: 'button', unique_id: `${id}_${key}`, name: label, command_topic: t(key, 'set'), payload_press: PRESS, device_class: 'update', ...common };
      commands.set(t(key, 'set'), { payload: PRESS, updates });
    };
    dev.update = (u) => {
      dev.cmps[u.key] = {
        p: 'update',
        unique_id: `${id}_${u.key}`,
        name: u.title,
        state_topic: t(u.key),
        command_topic: t(u.key, 'set'),
        payload_install: INSTALL,
        ...common,
      };
      dev.states.push([
        t(u.key),
        JSON.stringify({
          installed_version: u.image,
          latest_version: u.available ? `${u.image} (maj disponible)` : u.image,
          title: u.title,
          in_progress: busy.has(u.key),
        }),
      ]);
      commands.set(t(u.key, 'set'), { payload: INSTALL, updates: [u] });
    };
    dev.finish = () => {
      dev.discovery = {
        dev: { ids: [id], name, mf: 'Komodo', ...(via ? { via_device: via } : {}) },
        o: origin,
        cmps: dev.cmps,
      };
      devices.push(dev);
    };
    return dev;
  }

  const all = model.servers.flatMap((s) => s.updates);
  const allPending = all.filter((u) => u.available);
  const allContainers = model.servers.flatMap((s) => s.containers);

  const root = device('komodo', 'Komodo');
  root.sensor('servers', 'Serveurs', model.servers.length);
  root.sensor('containers', 'Dockers', allContainers.length);
  root.sensor('running', 'Dockers actifs', allContainers.filter((c) => ['running', 'healthy'].includes(c.state)).length);
  root.sensor('updates', 'Mises à jour disponibles', allPending.length);
  root.apiSensor();
  root.button('update_all', 'Tout mettre à jour', allPending);
  root.finish();

  for (const s of model.servers) {
    const id = `komodo_${s.slug}`;
    const pending = s.updates.filter((u) => u.available);
    const d = device(id, s.name, 'komodo');
    d.sensor('state', 'État', s.state);
    d.sensor('containers', 'Dockers', s.containers.length);
    d.sensor('running', 'Dockers actifs', s.containers.filter((c) => ['running', 'healthy'].includes(c.state)).length);
    d.sensor('updates', 'Mises à jour disponibles', pending.length);
    d.button('update_all', 'Tout mettre à jour', pending);
    for (const c of s.containers) {
      d.sensor(c.key, c.name, c.state, {
        icon: 'mdi:docker',
      });
    }
    for (const u of s.updates) d.update(u);
    d.finish();
  }
  return { devices, commands };
}

