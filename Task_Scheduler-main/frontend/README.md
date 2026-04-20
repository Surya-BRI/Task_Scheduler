# Frontend (Next.js)

App Router UI for Task Scheduler. Dev server: **http://localhost:5000** (see `package.json`).

## Full setup guide

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — environment variables, running locally, auth token behaviour, and folder layout.

## Quick start

```bash
# from repo root
copy frontend\.env.example frontend\.env.local
# set NEXT_PUBLIC_API_BASE_URL if API is not on localhost:4000

npm install
npm run dev:frontend
```

## Routes (starter)

| Path | Description |
|------|-------------|
| `/login` | Login |
| `/dashboard` | Dashboard |
| `/projects` | Projects |
| `/tasks` | Tasks |
| `/settings` | Settings |
