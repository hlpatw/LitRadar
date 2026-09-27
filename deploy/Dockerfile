FROM node:22-alpine AS builder
WORKDIR /build

COPY .. .
COPY overlay/ ./

RUN npm install --ignore-scripts
RUN npm run build:server && npm run build:client
RUN if [ -f dist/client/client/index.html ]; then mv dist/client/client/index.html dist/client/index.html; fi
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app

COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/dist/ ./dist/

EXPOSE 3000
CMD ["node", "dist/server/main.js"]
