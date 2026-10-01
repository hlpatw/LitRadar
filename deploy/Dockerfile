FROM node:22-bookworm-slim AS builder
WORKDIR /build
COPY . .
COPY deploy/overlay/ ./
RUN npm install --ignore-scripts --legacy-peer-deps
RUN npm run build:server && npm run build:client
RUN if [ -f dist/client/client/index.html ]; then mv dist/client/client/index.html dist/client/index.html; fi
RUN npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/scripts/db-init.mjs ./scripts/db-init.mjs
COPY --from=builder /build/deploy/migration.sql ./deploy/migration.sql
COPY --from=builder /build/deploy/seed.sql ./deploy/seed.sql
EXPOSE 3000
CMD ["sh","-c","export SERVER_HOST=0.0.0.0; export SERVER_PORT=${PORT:-3000}; node scripts/db-init.mjs && node dist/server/main.js"]
