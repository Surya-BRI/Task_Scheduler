# Database Access Patterns — Consistency Review

Last reviewed after SQL injection hardening. All runtime request paths should use Prisma ORM or parameterized `Prisma.sql`.

## Pattern tiers

| Tier | Usage | Examples |
|------|-------|----------|
| **ORM (preferred)** | CRUD on `ErpTS*` models in `schema.prisma` | `tasks`, `users`, `projects`, `notifications`, `leaveRequest` |
| **Parameterized raw SQL** | Cross-table reporting, ERP live DB, bulk MERGE | `design-list`, `chatter-posts`, `activities`, `deadline-alerts` |
| **Static DDL (bootstrap only)** | `onModuleInit` schema self-heal | `chatter-posts`, `projects`, `scheduler-assignments`, `requests` |
| **Migration scripts** | `prisma/ensure-*.ts`, `seed.ts` | Ops/bootstrap only; not in HTTP path |

## Service inventory

| Service | Raw SQL | Status |
|---------|---------|--------|
| `design-list` | `prisma.live.$queryRaw(Prisma.sql\`...\`)` | Parameterized |
| `chatter-posts` | `$queryRaw` / `$executeRaw` + static DDL | Parameterized runtime; DDL allowlisted |
| `projects` | QS status table DDL + `Prisma.sql` assignments | Parameterized runtime |
| `tasks` | `Prisma.sql` for QS workflow | Parameterized |
| `activities` | `Prisma.sql` for QS scope | Parameterized |
| `scheduler-assignments` | Tagged templates + static DDL | Parameterized runtime |
| `deadline-alerts` | `Prisma.sql` with `Prisma.join` | Parameterized |
| `requests` | Static DDL only in `onModuleInit` | ORM elsewhere |
| Auth, users, departments, chat, overtime, etc. | None | ORM only |

## Shared utilities

- `common/utils/sql-param.util.ts` — UUID validation, LIKE patterns, date parsing, WHERE builders
- `common/utils/prisma-sql-test.util.ts` — test helpers for bound-parameter assertions

## Automated enforcement

```bash
# From repository root
npm run security:check   # static scan + security unit tests (backend)
npm run ci               # hygiene + security + typecheck + backend tests
```

```bash
# From backend workspace only
npm run security:check-sql
npm run test:security
```

CI: `.github/workflows/ci.yml` (full pipeline) and `.github/workflows/security.yml` (path-filtered security re-check).

## Guidelines for new code

1. Prefer `prisma.model.findMany/create/update` when the model exists in `schema.prisma`.
2. Use `$queryRaw(Prisma.sql\`...\`)` with `${variable}` bindings — never `$queryRawUnsafe` with interpolated strings.
3. Validate UUIDs with `optionalUuid()` before queries; validate dates with `parseOptionalSqlDate()`.
4. Build dynamic filters with `Prisma.Sql[]` + `Prisma.join`, not string concatenation.
5. If static DDL is unavoidable, add `// security-sql:allow-static-ddl` and document in `DATABASE_MIGRATION_EVALUATION.md`.
