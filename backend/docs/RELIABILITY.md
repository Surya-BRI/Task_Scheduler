# Reliability and Operations Guide

Production reliability controls for the Task Scheduler API.

## Health endpoints

| Endpoint | Purpose | Use for |
|----------|---------|---------|
| `GET /api/v1/health` | **Liveness** — process is running | PM2 / load balancer "is the process up?" |
| `GET /api/v1/health/ready` | **Readiness** — database connectivity | Traffic routing, deploy gates, Kubernetes readiness |

### PM2 example

```javascript
// ecosystem.config.cjs — add health check after deploy
// curl -f http://localhost:7000/api/v1/health/ready || exit 1
```

### Nginx upstream health

```nginx
location /api/v1/health/ready {
  proxy_pass http://127.0.0.1:7000;
  proxy_connect_timeout 2s;
  proxy_read_timeout 2s;
}
```

## Graceful shutdown

The API handles `SIGTERM` and `SIGINT` (PM2 restart, `docker stop`, Ctrl+C):

1. Stops accepting new HTTP connections
2. Runs Nest `onModuleDestroy` hooks (Prisma `$disconnect`)
3. Exits within `SHUTDOWN_TIMEOUT_MS` (default **15s**) or forces exit

| Variable | Default | Description |
|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT_MS` | `15000` | Max wait before forced `process.exit(1)` |
| `HTTP_REQUEST_TIMEOUT_MS` | `30000` | Per-request HTTP timeout (returns 503) |

## Resilience patterns

### Retry (`withRetry`)

Transient DB errors (pool timeout, deadlock, P2024) are retried with linear backoff in ERP design-list queries.

### Circuit breaker (`getCircuitBreaker`)

After 5 consecutive ERP live-database failures, the `erp-live-database` breaker opens for 30s to avoid hammering a degraded dependency.

### Cron locks (`CronLockService`)

Scheduled jobs (deadline alerts) use:

1. **In-process guard** — skips if previous run still executing
2. **SQL Server `sp_getapplock`** — prevents duplicate runs across PM2 cluster instances

## Disaster recovery

See [DATABASE_BACKUP_RESTORE.md](./DATABASE_BACKUP_RESTORE.md) for:

- Daily full + 15-minute log backups
- Pre-deploy backup procedure
- Monthly restore testing
- RPO 24h / RTO 4h targets

## Incident checklist

1. Check `GET /health/ready` — if 503, investigate SQL Server connectivity
2. Check PM2 logs: `pm2 logs <id> --lines 100`
3. Verify ERP live DB if design-list returns 503
4. Restore from latest backup if data corruption suspected (see backup runbook)
