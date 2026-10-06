# Makefile pour komodo2mqtt — doc : docs/
.PHONY: help install test check start debug docker-build docker-release
.DEFAULT_GOAL := help

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

install: ## Installe les dépendances (npm ci, versions du package-lock.json)
	npm ci

test: ## Tests unitaires
	npm test

check: ## Un passage sans MQTT : affiche serveurs, dockers et mises à jour vus dans Komodo
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

docker-release: ## Release : version +1, commit, build et push Docker Hub, tag git
	bash docker-release.sh release
