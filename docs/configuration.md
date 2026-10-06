---
title: Configuration
description: config.conf, identifiants, MQTT / Home Assistant et commandes de komodo2mqtt
sidebar_position: 1
---

# Configuration

## `config.conf`

JSON, monté en lecture seule dans le conteneur (`/app/config.conf`, ou `CONFIG_FILE`). Modèle : `config.example.conf`.

| Clé | Rôle |
|---|---|
| `komodo.url` | URL de Komodo Core (`KOMODO_URL` prioritaire) — requis |
| `interval_seconds` | Intervalle entre deux lectures (défaut 60) |
| `log_level` | Niveau des traces : `error`, `warn`, `info` (défaut), `debug` (`LOG_LEVEL` ou `--debug` prioritaires) |
| `mqtt.broker` | URL du broker — requis en boucle |
| `mqtt.topic` | Préfixe des topics (défaut `komodo2mqtt`) |
| `mqtt.home_assistant_autodiscovery` | Découverte HA (défaut `true`) |
| `discovery_prefix` | Préfixe de découverte HA (défaut `homeassistant`) |

## Identifiants

`.env` (mode 600, jamais dans git ni dans l'image), modèle `.env.example` : `KOMODO_API_KEY`, `KOMODO_API_SECRET`,
`KOMODO_URL` (optionnel), `MQTT_USER` / `MQTT_PASS` (optionnels). Utiliser une clé API dédiée, avec les droits de
lecture et d'exécution (Pull / Deploy) sur les stacks et deployments à mettre à jour.

## Traces

Format : `2026-10-06T10:00:00.000Z INFO  message` ; `error` et `warn` sur stderr, le reste sur stdout
(`docker compose logs -f komodo2mqtt`).

| Niveau | Contenu |
|---|---|
| `error` | Échec d'une mise à jour, erreur MQTT, configuration invalide |
| `warn` | Komodo injoignable (une seule fois jusqu'au retour à la normale), serveur dont les dockers n'ont pas pu être lus |
| `info` | Démarrage, connexion MQTT, appareils annoncés/retirés, bilan Komodo quand il change, mises à jour demandées (étapes pull/deploy) |
| `debug` | Chaque appel à l'API Komodo (type, paramètres, statut HTTP, durée), chaque publication et commande MQTT, durée de chaque lecture |

Les clés API ne sont jamais écrites dans les traces. Pour diagnostiquer : `LOG_LEVEL=debug` ou `make debug`.

## MQTT et Home Assistant

| Topic (retenu) | Contenu |
|---|---|
| `<topic>/lwt` | `online` / `offline` |
| `<topic>/api` | `ON` / `OFF` : dernière lecture de Komodo réussie ou non |
| `<topic>/<appareil>/<entité>/state` | état de l'entité (valeur simple, ou JSON pour une entité `update`) |
| `<topic>/<appareil>/<entité>/set` | commande : `PRESS` (bouton), `INSTALL` (update) |

Appareils : `komodo` et `komodo_<serveur>`. La découverte est publiée sur `homeassistant/device/<appareil>/config` et
republiée quand Home Assistant redémarre (`homeassistant/status`).

## Commandes

| Cible | Effet |
|---|---|
| `make test` | Tests unitaires |
| `make check` | Un passage sans MQTT : affiche serveurs, dockers et mises à jour vus dans Komodo |
| `make start` | Boucle en local |
| `make debug` | Boucle en local avec les traces `debug` |
| `make docker-build` / `make docker-release` | Image locale / release Docker Hub `mathmath350/komodo2mqtt` |

## Conteneur

`docker-compose.yml` du repo : `config.conf` en lecture seule, `.env` en `env_file`, `restart: unless-stopped`.

Mise en service conseillée : lancer `make check` pour vérifier ce que Komodo renvoie, puis démarrer la boucle et
contrôler les appareils dans Home Assistant avant d'utiliser « Tout mettre à jour ».
