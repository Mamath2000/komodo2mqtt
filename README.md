# komodo2mqtt

Bridges [Komodo](https://komo.do) to Home Assistant through MQTT, with Home Assistant **device discovery**:
a `Komodo` device, one device per server, a status sensor per docker, an `update` entity per stack service /
deployment (installable from Home Assistant) and "update all" buttons.

Full documentation (French): **[docs/](docs/index.md)**.

## Quick start (Docker)

```bash
cp config.example.conf config.conf        # Komodo URL, MQTT broker
cp .env.example .env && chmod 600 .env     # KOMODO_API_KEY / KOMODO_API_SECRET (never in git or in the image)
docker compose up -d
```

Log level: `log_level` in `config.conf` (`error`, `warn`, `info`, `debug`) or `LOG_LEVEL` / `--debug`.

`make help` lists the local commands (`test`, `check`, `start`, `docker-build`, `docker-release`).
