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
`KOMODO_URL` (optionnel), `MQTT_USER` / `MQTT_PASS` (optionnels).

### Droits de l'utilisateur Komodo

Utiliser une clé API dédiée, d'un utilisateur de service (Settings → Users) : pas besoin d'être administrateur. Komodo
ne renvoie à un utilisateur que les ressources sur lesquelles il a un droit : sans droit, les listes sont **vides**
(`make check` le détecte).

| Ressource | Niveau | Sert à |
|---|---|---|
| Servers | **Read** | serveurs, état, dockers (`ListServers`, `ListContainers`) |
| Stacks | **Execute** | mises à jour des services (`PullStack`, `DeployStack`) ; Execute inclut Read |
| Deployments | **Execute** | mises à jour des deployments (`PullDeployment`, `Deploy`) |

- **Alertes** : il n'existe pas de droit « alertes » à part. `ListAlerts` ne renvoie que les alertes des ressources que
  l'utilisateur peut lire : Read sur les serveurs, stacks et deployments (déjà couvert par le tableau) suffit. Pour
  les alertes d'autres types de ressources (builds, repos…), donner Read dessus.
- Le contrôle des mises à jour (`CheckStackForUpdate` / `CheckDeploymentForUpdate`, appelés après une mise à jour et par le bouton « Vérifier ») passe par l'API `write` de Komodo mais ne demande que **Execute** sur la ressource.
- Le niveau **Write** n'est jamais nécessaire : l'app ne modifie pas la configuration.
- En lecture seule (états, compteurs, alertes), Read partout suffit, mais les boutons « mettre à jour » et les entités
  `update` échoueront : Komodo refuse `Pull` / `Deploy` sans Execute.
- Le droit doit couvrir **chaque** stack et deployment à mettre à jour : passer par un groupe d'utilisateurs ou un tag
  évite d'en oublier. En cas d'erreur sur une mise à jour, `LOG_LEVEL=debug` montre la réponse de Komodo.

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
| `<topic>/<appareil>/alerts/attributes` | JSON : `critical` et les 10 alertes ouvertes les plus récentes |
| `<topic>/<appareil>/<entité>/set` | commande : `PRESS` (bouton), `INSTALL` (update) |

Appareils : `komodo` et `komodo_<serveur>`. La découverte est publiée sur `homeassistant/device/<appareil>/config` et
republiée quand Home Assistant redémarre (`homeassistant/status`).

## Commandes

| Cible | Effet |
|---|---|
| `make test` | Tests unitaires |
| `make check` | Diagnostic sans MQTT en 3 étapes : connexion/authentification Komodo, liste des serveurs, dockers et mises à jour. Code de sortie 1 au premier problème (clé refusée, Komodo injoignable, aucun serveur visible, serveur hors ligne) |
| `make start` | Boucle en local |
| `make debug` | Boucle en local avec les traces `debug` |
| `make docker-build` | Image locale (sans push) |
| `make docker-release` | Release Docker Hub `mathmath350/komodo2mqtt` : **build** +1 automatique (`0.3.7` → `0.3.8`) |
| `make docker-release-minor` | Release avec version **mineure** +1, build remis à 0 (`0.3.7` → `0.4.0`) |
| `make docker-release-major` | Release avec version **majeure** +1, mineur et build remis à 0 (`0.3.7` → `1.0.0`) |

Chaque release commite la nouvelle version (`package.json`, `package-lock.json`), construit et pousse l'image
(`latest`, la version, la référence git) puis pose le tag git `vX.Y.Z` ; il faut un dépôt propre et être connecté à
Docker Hub. À pousser ensuite : `git push origin main --tags`.

## Conteneur

`docker-compose.yml` du repo : `config.conf` en lecture seule, `.env` en `env_file`, `restart: unless-stopped`.

Mise en service conseillée : lancer `make check` pour vérifier ce que Komodo renvoie, puis démarrer la boucle et
contrôler les appareils dans Home Assistant avant d'utiliser « Tout mettre à jour ».
