# DevOps and Observability Guide

Operations, containerization, CI/CD, logging, and tracing for Task Scheduler.

## Docker

Build from repository root:

```bash
docker build -f backend/Dockerfile -t task-scheduler-api .
docker build -f frontend/Dockerfile -t task-scheduler-web .
```

Run both services (SQL Server remains external):

```bash
export JWT_ACCESS_SECRET='your-production-secret-min-16'
export DATABASE_URL='sqlserver://host:1433;database=...;user=...;password=...;encrypt=true;trustServerCertificate=true'
export CORS_ORIGIN='http://localhost:5000'

docker compose up --build
```

| Service | Port | Health |
|---------|------|--------|
| Backend | 7000 | `GET /api/v1/health/ready` |
| Frontend | 5000 | `GET /` |

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/ci.yml` | push/PR to main, master, develop | typecheck, tests, builds, Docker image validation |
| `.github/workflows/security.yml` | PR touching backend security paths | SQL injection guard |
| `.github/workflows/deploy-staging.yml` | manual | build verification + staging deploy checklist |

Local CI parity:

```bash
npm run ci
npm run build
```

## Prisma migrations in deploy

Production deploy sequence:

```bash
npm run prisma:migrate:deploy --workspace backend
npm run build --workspace backend
pm2 restart task-sc
curl -sf http://localhost:7000/api/v1/health/ready
```

For greenfield databases use `npm run prisma:deploy:bootstrap --workspace backend` once, then rely on migrations.

## Structured logging

Production logs are JSON lines for ingestion by CloudWatch, Datadog, Loki, etc.

| Field | Description |
|-------|-------------|
| `timestamp` | ISO-8601 |
| `level` | `debug`, `log`, `warn`, `error` |
| `context` | Logger context (e.g. `HTTP`, `HttpExceptionFilter`) |
| `message` | Human-readable summary |
| `requestId` | Correlation ID from `X-Request-Id` |
| `method`, `path`, `statusCode`, `durationMs` | HTTP request metadata |

Every response includes `X-Request-Id`. Error payloads include `requestId` for support tickets.

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOG_LEVEL` | `debug` | Minimum level (`info` maps to `log`) |
| `SERVICE_NAME` | `task-scheduler-api` | Service identifier for traces |

## Sentry (optional)

Set `SENTRY_DSN` to enable error tracking. No DSN = Sentry disabled (zero overhead).

| Variable | Default |
|----------|---------|
| `SENTRY_DSN` | (empty) |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` |

## OpenTelemetry (optional)

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces (Jaeger, Grafana Tempo, Honeycomb, etc.).

Example Jaeger:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

## Rollback strategy

1. **Application rollback** — redeploy previous Git tag or WinSCP upload of last stable `dist/` artifacts; `pm2 restart task-sc`.
2. **Database rollback** — restore from pre-deploy backup (see [DATABASE_BACKUP_RESTORE.md](./DATABASE_BACKUP_RESTORE.md)); never `migrate reset` in production.
3. **Docker rollback** — retag previous image digest and `docker compose up -d`.
4. **Verify** — `curl -sf /api/v1/health/ready` and run post-deploy smoke tests from [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md).

## Monitoring checklist

- Alert on `GET /health/ready` returning 503 for > 2 minutes
- Alert on 5xx rate > 1% over 5 minutes
- Alert on P95 latency > 2s on `/api/v1/tasks` and `/api/v1/scheduler-assignments`
- Dashboard: request rate, error rate, DB connection pool, cron lock skips, circuit breaker opens

See also [RELIABILITY.md](./RELIABILITY.md) for graceful shutdown, timeouts, and cron protection.
