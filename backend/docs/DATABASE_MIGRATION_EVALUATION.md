# Runtime DDL vs Prisma Migrations — Evaluation

This document evaluates replacing application-startup DDL (`$executeRawUnsafe` in `onModuleInit`) with Prisma-managed migrations.

## Current Runtime DDL Locations

| Location | Purpose | User input |
|----------|---------|------------|
| `chatter-posts.service.ts` (`onModuleInit`) | Chatter junction/seen tables + mention backfill | None |
| `projects.service.ts` (`ensureQsStatusTable`) | `ErpTSProjectQsStatus` table | None |
| `scheduler-assignments.service.ts` (`onModuleInit`) | Holiday + leave reschedule snapshot tables | None |
| `requests.service.ts` (`onModuleInit`) | `ErpTSLeaveRequest` column additions | None |
| `prisma/ensure-*.ts` | One-off bootstrap scripts | None |

All runtime DDL is **static SQL** with no request parameters. Each call is annotated with `// security-sql:allow-static-ddl` and enforced by `npm run security:check-sql`.

## Recommendation

| Approach | When to use |
|----------|-------------|
| **Keep runtime DDL (short term)** | Brownfield SQL Server deployments where schema drift is corrected at boot; minimizes deployment friction for existing environments. |
| **Move to Prisma migrations (preferred long term)** | New environments, CI/CD pipelines, and teams requiring auditable, versioned schema history. |

### Migration path (non-breaking)

1. **Inventory** — Capture current `CREATE TABLE` / `ALTER TABLE` statements from the four `onModuleInit` handlers and `ensure-*.ts` scripts.
2. **Generate migrations** — Add equivalent `prisma migrate` SQL files under `backend/prisma/migrations/`.
3. **Deploy gate** — Run `prisma migrate deploy` in CI/CD **before** application start.
4. **Retire runtime DDL** — Remove `onModuleInit` DDL blocks once all environments have applied migrations (feature-flag or version check optional).
5. **Keep ensure scripts** — Retain `prisma/ensure-*.ts` as manual ops tools until migrations are verified in production.

### Benefits of Prisma migrations

- Versioned, reviewable schema changes in pull requests
- No race conditions when multiple app instances start concurrently
- Clear rollback strategy via migration history
- Aligns with `security:check-sql` goal of eliminating RawUnsafe from application code paths

### Risks of immediate removal

- Production databases that rely on boot-time self-healing would fail if migrations are not run first
- ERP-adjacent tables (`ErpTS*`) may not be fully represented in `schema.prisma` today

## Conclusion

Runtime DDL is **acceptable for static bootstrap in development** but is **disabled by default in production** (`RUNTIME_SCHEMA_BOOTSTRAP` defaults to `false` when `NODE_ENV=production`). Use Prisma migrations for all production deployments.

Phase 3 (July 2026) added:
- `backend/prisma/migrations/` with idempotent baseline + performance index migrations
- `RUNTIME_SCHEMA_BOOTSTRAP` env flag gating boot-time DDL
- Missing Prisma models (`ChatterPostSeen`, `ProjectQsStatus`, `ProjectQsAssignment`, `LeaveRescheduleSnapshot`)
- Performance indexes on leave, overtime, chatter, scheduler, activity log paths
- Transaction hardening for overtime create/review and timer draft sessions
- `backend/docs/DATABASE_BACKUP_RESTORE.md` runbook

## Execution checklist (when environments are ready)

Run **before** `start:prod` in each deployment:

```bash
# Option A — SQL bootstrap scripts (current brownfield path)
npm run deploy:bootstrap
# equivalent: npm run prisma:setup

# Option B — Prisma migrations (when migration history is adopted)
npm run prisma:migrate:deploy --workspace backend
npm run prisma:generate --workspace backend
```

Then start the API:

```bash
npm run start:prod --workspace backend
```

**Retire runtime `onModuleInit` DDL** only after every environment has run Option A or B successfully at least once. Until then, boot-time DDL remains a safe fallback and does not affect API behavior.

## CI/CD integration

Root-level validation (includes SQL security):

```bash
npm run security:check   # static SQL scan + security unit tests
npm run ci               # hygiene + security + typecheck + backend tests
```

GitHub Actions: `.github/workflows/ci.yml` runs on push/PR to `main`, `master`, and `develop`.
