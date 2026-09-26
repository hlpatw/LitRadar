FROM node:22-alpine AS builder
WORKDIR /build
COPY . .
COPY deploy/overlay/ ./
RUN npm install --ignore-scripts --legacy-peer-deps
RUN npm run build:server && npm run build:client
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/scripts/db-init.mjs ./scripts/db-init.mjs
COPY --from=builder /build/deploy/migration.sql ./deploy/migration.sql
COPY --from=builder /build/deploy/seed.sql ./deploy/seed.sql
EXPOSE 3000
CMD ["sh","-c","export SERVER_HOST=0.0.0.0; export SERVER_PORT=${PORT:-3000}; node scripts/db-init.mjs && node dist/server/main.js"]
