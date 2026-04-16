# Stack — Frontend

Vite + React 19 SPA. Talks to the Stack API with `fetch` and Supabase Auth in the browser.

| Tech | Badge |
|------|--------|
| Runtime | ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white) |
| Build | ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white) |
| UI | ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white) ![Radix Themes](https://img.shields.io/badge/Radix_Themes-3-161618) |
| Data / voice | ![Supabase](https://img.shields.io/badge/Supabase-js-3ECF8E?logo=supabase&logoColor=black) ![Vapi](https://img.shields.io/badge/Vapi-web-000000) |

## What this app does

- **Login**: Google (and Supabase session) via `signInWithOAuth`; session persisted; `AuthProvider` exchanges OAuth `code` when present, then loads `/auth/me`.
- **Files**: List, upload (Uppy), open in viewers (PDF stack includes react-pdf / embedpdf-related deps), trash, workspace assignment from the UI where exposed.
- **Workspaces**: Folder-style navigation, workspace-scoped routes.
- **Chat**: Workspace chat panel; copy on individual assistant/user messages.
- **Voice**: `@vapi-ai/web` session; metadata sends `userId`, optional `workspaceId`, `accessToken` for server tools; parses `<<<STACK_META>>>` from assistant text and tool results for referenced files and client actions (copy link, download file, etc.).
- **API client**: `VITE_API_URL` prefixes requests; `api-authed` attaches Bearer token and refreshes via `POST /auth/refresh` on 401.

## Layout

```
frontend/
├── public/
├── src/
│   ├── auth/           # AuthProvider, useAuth, signInWithGoogle
│   ├── components/     # UI including workspace, voice overlay, chat
│   ├── hooks/          # useVapi, etc.
│   ├── layouts/
│   ├── lib/            # api, supabase, routes, vapi hints, stack meta parsing
│   ├── pages/
│   ├── services/       # file API helpers
│   ├── store/
│   └── router.tsx
├── vercel.json         # SPA fallback so /login and deep links serve index.html
├── vite.config.ts
└── package.json
```

## Environment

Copy `.env.example` → `.env` or `.env.local`:

| Variable | Required | Role |
|----------|----------|------|
| `VITE_API_URL` | Yes (prod) | API origin, e.g. `https://api.example.com` — no trailing slash |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |

Optional: `VITE_VAPI_PUBLIC_KEY`, `VITE_VAPI_ASSISTANT_ID` for voice.

## Scripts

```bash
npm install
npm run dev      # Vite dev server (default port 5173)
npm run build    # tsc -b && vite build → dist/
npm run preview  # Serve dist locally
npm run lint
```

## Production (Vercel)

- Set **Root Directory** to `frontend` if the repo is the monorepo root.
- **vercel.json** rewrites non-file paths to `/` so React Router paths (`/login`, `/workspaces/...`) do not 404.
- In **Supabase**: add exact redirect URLs for your production origin (e.g. `https://your-domain/login`) and set **Site URL** to the SPA origin, not the API host.

## Future plans

- Env-driven feature flags for voice and experimental viewers.
- E2E tests for auth redirect and `/login` deep link on preview deploys.
- Optional PWA / offline read-only cache (not implemented).
