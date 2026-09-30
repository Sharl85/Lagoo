# LaGo 🌸 - Version web + API (Node.js, aucune dépendance d'exécution)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/storage

COPY package.json lago.config.json ./
COPY server ./server
COPY scripts ./scripts
COPY src ./src
COPY data/seed.json ./data/seed.json

# Construction de la version web (dist/web)
RUN node scripts/build.js web \
 && mkdir -p /app/storage && chown -R node:node /app/storage

USER node
VOLUME ["/app/storage"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/server.js"]
