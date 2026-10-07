---
id: index
title: komodo2mqtt
description: Pont Komodo vers Home Assistant via MQTT (discovery device-based)
sidebar_position: 0
---

# komodo2mqtt

Lit l'API de Komodo à intervalle régulier et publie sur MQTT les serveurs, les dockers et les mises à jour
disponibles, avec la découverte automatique de Home Assistant au format *device-based* (un seul message
`homeassistant/device/<id>/config` par appareil). Les mises à jour et les « tout mettre à jour » se déclenchent
depuis Home Assistant.

- Configuration, MQTT, commandes : [Configuration](configuration.md).

## Ce que l'on obtient dans Home Assistant

**Appareil « Komodo »**

- capteurs : serveurs, dockers, dockers actifs, mises à jour disponibles ;
- **alertes** : capteur `Alertes ouvertes` (détail en attributs) et capteur binaire `Problème` (allumé dès qu'une alerte est ouverte) ;
- `API Komodo` (connectivité) ;
- bouton **Tout mettre à jour**.

**Un appareil par serveur** (rattaché à Komodo)

- en **diagnostic** : état du serveur, dockers, dockers actifs, mises à jour disponibles, `Alertes ouvertes` et `Problème` du serveur (alertes du serveur, de ses stacks et de ses deployments) ;
- bouton **Tout mettre à jour** (limité au serveur) ;
- un bouton **Vérifier `<stack>`** par stack : demande à Komodo de recalculer les digests d'images du stack (voir ci-dessous) ;
- en **capteurs** (section principale) : l'état de chaque docker : `running`, `healthy`, `unhealthy`, `starting`, `stopped`, `restarting`, `paused` ;
- une entité **update** par service de stack et par deployment, installable depuis Home Assistant.

## Fonctionnement

À chaque passage (`interval_seconds`, 60 s par défaut) :

1. Lecture de `ListServers`, `ListStacks`, `ListDeployments` (sans pagination, `limit: 0`) puis `ListContainers` par
   serveur joignable (`ListDockerContainers` avant Komodo 2.3).
2. Les mises à jour viennent de `update_available` : par service pour les stacks, par deployment sinon. Les dockers
   qui ne dépendent ni d'un stack ni d'un deployment n'ont que leur état.
3. Publication (retenue, uniquement si la valeur change) des états et de la découverte ; un serveur disparu est retiré.

**Alertes.** `ListAlerts` renvoie les alertes ouvertes (non résolues) des ressources que l'utilisateur de la clé API peut
lire. Elles sont rattachées au serveur concerné (directement, ou via le stack / deployment qui y tourne) ; l'appareil
`Komodo` compte toutes les alertes lisibles, y compris celles qui ne dépendent d'aucun serveur (build, repo…). Le capteur
`Alertes ouvertes` a pour attributs `critical` (nombre d'alertes critiques) et `alerts` (les 10 plus récentes : niveau,
type, ressource, date). Si les alertes ne peuvent pas être lues, les entités d'alertes sont **absentes** plutôt que
d'afficher un faux zéro (un avertissement est écrit dans les traces et `make check` le signale).

**Contrôle des mises à jour.** Après un déploiement limité à certains services, Komodo efface les digests d'images
« latest » de tout le stack : les autres services paraissent alors à jour jusqu'au prochain contrôle planifié de Komodo,
alors qu'ils tournent toujours avec l'ancienne image. Pour l'éviter, l'app lance `CheckStackForUpdate` (ou
`CheckDeploymentForUpdate`) juste après chaque mise à jour, sans déclencher d'auto-redéploiement. Le bouton
**Vérifier `<stack>`** fait la même chose à la demande. Un échec de ce contrôle n'invalide pas la mise à jour : il est
signalé en `warn` dans les traces.

Installer une mise à jour (entité `update` ou bouton) exécute dans Komodo, **l'une après l'autre** et en attendant la
fin de chaque Update : `PullStack` puis `DeployStack` (limités aux services concernés), ou `PullDeployment` puis
`Deploy`. Pendant l'opération, l'entité passe en « mise à jour en cours ».
