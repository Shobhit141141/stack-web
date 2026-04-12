# Stack frontend

Vite + React 19 + TypeScript, **Tailwind CSS v4** (`@tailwindcss/vite`), **Radix Themes**, **React Router**, **`apiFetch` / `apiFetchOk`**, **Zustand**, **React Icons**.

## Location

This app lives at **`frontend/`** next to **`backend/`** at the repository root (`stack/frontend` on disk when the repo is cloned as `stack`).

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Environment

Copy `.env.example` to `.env` and set `VITE_API_URL` to your API origin (e.g. `http://localhost:3000`). Relative paths in `apiFetch('/files')` are prefixed with that value.
