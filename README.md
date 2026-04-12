# Stack

Monorepo layout:

| Directory   | Description                          |
|------------|--------------------------------------|
| `backend/` | Express API, Prisma, workers, etc.   |
| `frontend/` | Vite + React + TypeScript SPA      |

## Quick start

```bash
# API (from repo root)
npm install --prefix backend
npm run dev --prefix backend

# Web app
npm install --prefix frontend
npm run dev --prefix frontend
```

Or use root scripts: `npm run dev:backend` and `npm run dev:frontend` after `npm install` at the root (see `package.json`).

## GitHub

Clone this repository; you will see `backend/` and `frontend/` at the top level.
