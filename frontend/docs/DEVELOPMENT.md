# Frontend — developer guide

Next.js (App Router) + TypeScript + Tailwind. Dev server listens on **port 5000** (see `package.json` scripts).

## Quick reference

| Item | Value |
|------|--------|
| Dev URL | http://localhost:5000 |
| Default API | `NEXT_PUBLIC_API_BASE_URL` → `http://localhost:4000/api/v1` |

## Environment variables

Create `frontend/.env.local` from `frontend/.env.example`.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for REST calls (must include `/api/v1` if your API uses that prefix). |
| `NEXT_PUBLIC_WEB_URL` | Public site URL (e.g. `http://localhost:5000`). |
| `NEXT_PUBLIC_APP_NAME` | Display name in UI. |

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

After changing env files, restart `next dev`.

## Run the app

From repository root:

```bash
npm run dev:frontend
```

Or from `frontend/`:

```bash
npm run dev
```

Open http://localhost:5000 — root redirects to `/login` unless you change `src/app/page.jsx`.

## Auth and API client

- Login stores the JWT in **localStorage** (`task_scheduler_access_token`).
- `src/lib/api-client.ts` attaches `Authorization: Bearer …` and redirects to `/login` on `401` for protected calls (not on failed `/auth/login`).

If the API runs on a non-default host/port, update `NEXT_PUBLIC_API_BASE_URL` and ensure backend `CORS_ORIGIN` includes `http://localhost:5000`.

## Routes (starter)

| Path | Purpose |
|------|---------|
| `/login` | Sign in |
| `/dashboard` | Dashboard shell |
| `/projects` | Projects placeholder |
| `/tasks` | Tasks placeholder |
| `/settings` | Settings placeholder |

Layouts live under `src/app/(auth)` and `src/app/(dashboard)`.

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |

## Project layout (frontend)

- `src/app` — App Router pages and layouts  
- `src/components` — shared UI and layout chrome  
- `src/features` — feature-specific UI and API helpers  
- `src/lib` — `api-client`, env, auth token helpers  
- `src/hooks` — client hooks  
