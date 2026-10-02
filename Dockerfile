# Single source of truth: root IS the production app (no deploy/overlay merge).
FROM node:22-alpine AS builder
WORKDIR /build
COPY . .
RUN npm install --ignore-scripts --legacy-peer-deps
RUN npm run build:server && npm run build:client
RUN BUILT=$(find dist/client -mindepth 2 -name index.html | head -n1); if [ -n "$BUILT" ]; then mv "$BUILT" dist/client/index.html; fi
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
# Runtime runs in production mode so the fail-fast guards (DATABASE_URL, JWT_SECRET) fire.
# APP_ENV (staging/prod) is orthogonal and drives the label shown in /api/version.
ENV NODE_ENV=production
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules/ ./node_modules/
# dist carries compiled server AND the SQL migrations copied by nest-cli assets.
COPY --from=builder /build/dist/ ./dist/
EXPOSE 3000
# Startup runs the tracked migration runner (server/database/migrator) before serving.
CMD ["sh","-c","export SERVER_HOST=0.0.0.0; export SERVER_PORT=${PORT:-3000}; node dist/server/main.js"]
