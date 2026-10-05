# komodo2mqtt

Fait le lien entre [Komodo](https://komo.do) et Home Assistant via MQTT, avec l'auto-discovery
au format **device-based** (un seul message `homeassistant/device/<id>/config` par device).

## Ce que l'on obtient dans Home Assistant

**Device « Komodo »**
- capteurs : serveurs, dockers, dockers actifs, mises à jour disponibles, API Komodo (connectivité)
- bouton **Tout mettre à jour**

**Un device par serveur** (rattaché à Komodo)
- capteurs : état du serveur, dockers, dockers actifs, mises à jour disponibles
- bouton **Tout mettre à jour** (limité au serveur)
- un capteur d'état par docker : `running`, `healthy`, `unhealthy`, `starting`, `stopped`, `restarting`, `paused`
- une entité **update** par service de stack / deployment, installable depuis HA
  (Komodo fait `PullStack` + `DeployStack`, ou `PullDeployment` + `Deploy`)

## Installation

```bash
cp .env.example .env   # renseigner Komodo (clé API) et MQTT
docker compose up -d --build
```

Ou sans Docker : `npm ci && node --env-file=.env src/index.js` (Node ≥ 20).

| Variable | Défaut | Rôle |
|---|---|---|
| `KOMODO_URL` | – | URL de Komodo Core |
| `KOMODO_API_KEY` / `KOMODO_API_SECRET` | – | Clé API Komodo (lecture + exécution) |
| `MQTT_URL` | – | ex. `mqtt://broker:1883` |
| `MQTT_USER` / `MQTT_PASS` | – | Identifiants MQTT |
| `POLL_INTERVAL` | `60` | Secondes entre deux lectures |
| `BASE_TOPIC` | `komodo2mqtt` | Préfixe des topics d'état/commande |
| `DISCOVERY_PREFIX` | `homeassistant` | Préfixe de discovery HA |

## Notes
- Les dockers non gérés par un stack/deployment Komodo n'ont que leur statut (pas d'update).
- Les mises à jour sont exécutées l'une après l'autre ; `in_progress` est affiché sur l'entité update.
- Tests : `npm test`.
