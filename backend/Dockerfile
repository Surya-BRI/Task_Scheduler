# Build from repository root:
#   docker build -f backend/Dockerfile -t task-scheduler-api .

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# postinstall runs "prisma generate" — schema must exist before npm ci
COPY backend/prisma/schema.prisma backend/prisma/schema.prisma

RUN npm ci --workspace backend --include-workspace-root --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend/prisma/schema.prisma backend/prisma/schema.prisma

RUN npm ci --workspace backend --include-workspace-root

COPY backend backend

RUN npm run prisma:generate --workspace backend \
  && npm run build --workspace backend

FROM node:20-alpine AS runner
WORKDIR /app/backend

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=deps /app/node_modules /app/node_modules

RUN mkdir -p uploads/chatter && chown -R app:app /app

USER app

EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
