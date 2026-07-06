# Task Scheduler Deployment Runbook (WinSCP + PuTTY)

## 1. Server Paths
- Backend: `/home/ubuntu/bri-erp-api/task-scheduler/backend`
- Frontend: `/home/ubuntu/bri-erp-api/task-scheduler/frontend`

## 2. Upload via WinSCP
Upload only changed files from local repo to same relative path on server.

### Backend (common)
- `backend/src/tasks/tasks.service.ts`
- `backend/src/tasks/dto/update-task-status.dto.ts`

### Frontend (common)
- `frontend/src/views/TaskDetailsPage.jsx`
- `frontend/src/features/scheduler/components/DesignSchedulerScreen.jsx`
- `frontend/src/features/design-list/task-view-model.js`
- `frontend/src/features/design-list/components/DesignListScreen.jsx`
- `frontend/src/features/design-list/components/DesignerDesignListScreen.jsx`

## 3. Backend Deploy Commands (PuTTY)
```bash
cd /home/ubuntu/bri-erp-api/task-scheduler/backend
npm run clean
npm run build
test -f dist/main.js && echo "OK dist/main.js"
pm2 restart 76
pm2 logs 76 --lines 50
```

If backend PM2 id/name is different, replace `76`.

### PM2 entry path (important)
Production build output is `backend/dist/main.js` (not `dist/src/main.js`).

If PM2 shows `Cannot find module ... dist/src/main.js`:
```bash
cd /home/ubuntu/bri-erp-api/task-scheduler/backend
npm run build
pm2 delete 76
pm2 start ecosystem.config.cjs
pm2 save
```

Or point the existing process at npm:
```bash
cd /home/ubuntu/bri-erp-api/task-scheduler/backend
pm2 delete 76
pm2 start npm --name task-sc -- run start:prod
pm2 save
```

`npm run build` automatically writes a legacy shim at `dist/src/main.js` for older PM2 configs (no extra script file needed).

## 4. Frontend Deploy Commands (PuTTY)
If frontend is hosted from this server:
```bash
cd /home/ubuntu/bri-erp-api/task-scheduler/frontend
npm run build
pm2 restart <frontend-pm2-id-or-name>
```

If frontend is Vercel-hosted, deploy frontend there instead.

### Frontend environment (required for auth)
Set these **before** `npm run build` (or in Vercel project settings, then redeploy):

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |
| `API_PROXY_TARGET` | `https://task-scheduler.app-brisigns.com` |
| `NEXT_PUBLIC_WEB_URL` | Your public frontend URL |
| `JWT_ACCESS_EXPIRES_IN` | `1d` (optional; matches backend) |

Do **not** set `NEXT_PUBLIC_API_BASE_URL` to the full `https://task-scheduler.app-brisigns.com/api/v1` URL — login cookies are on the frontend host and will not be sent cross-site.

Backend `CORS_ORIGIN` must include the frontend URL when `NODE_ENV=production`.

## 5. DB Check Constraint (one-time / when status changes)
Task status constraint must include:
- `PENDING`
- `WIP`
- `COMPLETED`
- `REVISION`
- `APPROVED`
- `ON_HOLD`

### Verify constraint
```sql
SELECT cc.name, cc.definition
FROM sys.check_constraints cc
WHERE cc.name = 'CK_Task_status';
```

### Update constraint
```sql
ALTER TABLE [dbo].[ErpTSTask] DROP CONSTRAINT [CK_Task_status];
ALTER TABLE [dbo].[ErpTSTask] WITH CHECK ADD CONSTRAINT [CK_Task_status]
CHECK ([status] IN ('PENDING','WIP','COMPLETED','REVISION','APPROVED','ON_HOLD'));
```

## 6. Post-Deploy Smoke Tests
1. Sign in — confirm no immediate redirect to `/login?expired=1`.
2. DevTools → Network: first API call should be same-origin `/api/v1/...` with `Cookie: access_token`.
3. Open Design List and verify rows load from `/api/v1/tasks`.
2. Open Scheduler and verify real designers load (not mock list).
3. Hold/unhold a task in Scheduler and confirm status persists.
4. Open task detail by UUID and verify task loads.
5. Try non-UUID task URL (`/api/v1/tasks/12746`) and confirm no server crash (should be 400, not 500).

## 7. Known Error Meanings
- `Conversion failed when converting from a character string to uniqueidentifier`
  - Cause: Non-UUID passed to `/tasks/:id`.
  - Fix: Frontend must not call task endpoint with numeric/project ids; backend UUID guard must be deployed.

- `CK_Task_status` constraint error
  - Cause: DB check constraint missing one of used status values.
  - Fix: Update `CK_Task_status` values (see section 5).

## 8. Quick Rollback
1. Re-upload previous stable file versions with WinSCP.
2. Rebuild + restart PM2.
3. Confirm logs are clean.

## 9. Health checks (post-deploy)

Verify the API is ready before sending traffic:

```bash
curl -sf http://localhost:7000/api/v1/health
curl -sf http://localhost:7000/api/v1/health/ready
```

- **Liveness** (`/health`) — process is up
- **Readiness** (`/health/ready`) — database is reachable (use for deploy gates)

See [backend/docs/RELIABILITY.md](backend/docs/RELIABILITY.md) for graceful shutdown, timeouts, and cron protection.

## 10. Docker (optional)

```bash
export JWT_ACCESS_SECRET='your-secret-min-16-chars'
export DATABASE_URL='sqlserver://...'
export CORS_ORIGIN='https://your-frontend.example.com'
docker compose up --build
```

See [backend/docs/DEVOPS.md](backend/docs/DEVOPS.md) for CI/CD, structured logging, Sentry, and OpenTelemetry.

