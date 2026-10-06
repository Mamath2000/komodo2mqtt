# Makefile pour komodo2mqtt — doc : docs/
.PHONY: help install test check start debug docker-build docker-release docker-release-minor docker-release-major
.DEFAULT_GOAL := help

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

install: ## Installe les dépendances (npm ci, versions du package-lock.json)
	npm ci

test: ## Tests unitaires
	npm test

check: ## Diagnostic sans MQTT : test de connexion Komodo, liste des serveurs, dockers et mises à jour
	@[ -f config.conf ] || { echo "config.conf absent"; exit 1; }
	@set -a; [ -f .env ] && . ./.env; set +a; node src/main.js --once

start: ## Lance la boucle en local (config.conf + .env, états sur MQTT)
	@[ -f config.conf ] || { echo "config.conf absent"; exit 1; }
	@set -a; [ -f .env ] && . ./.env; set +a; node src/main.js

debug: ## Comme start, avec les traces debug (appels Komodo, publications MQTT)
	@[ -f config.conf ] || { echo "config.conf absent"; exit 1; }
	@set -a; [ -f .env ] && . ./.env; set +a; node src/main.js --debug

docker-build: ## Construit l'image locale (sans push)
	bash docker-release.sh build

docker-release: ## Release : build +1 (X.Y.Z+1), commit, build et push Docker Hub, tag git
	bash docker-release.sh release

docker-release-minor: ## Release : mineur +1, build remis à 0 (X.Y+1.0), commit, build et push Docker Hub, tag git
	bash docker-release.sh release-minor

docker-release-major: ## Release : majeur +1, mineur et build à 0 (X+1.0.0), commit, build et push Docker Hub, tag git
	bash docker-release.sh release-major
