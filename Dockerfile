# Dockerfile pour komodo2mqtt
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Uniquement le code : config.conf et .env sont fournis au lancement (volume, env_file), jamais dans l'image
COPY src/ ./src/

ENV NODE_ENV=production

CMD ["node", "src/main.js"]
