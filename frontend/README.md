# Stack — Frontend

Vite + React 19 SPA. Talks to the Stack API with `fetch` and Supabase Auth in the browser. Tailwind v4 + Radix Themes + Mona Sans set the visual language; the same look is reused by the browser extension.

| Tech | Badge |
|------|--------|
| Runtime | ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white) |
| Build | ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white) |
| UI | ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white) ![Radix Themes](https://img.shields.io/badge/Radix_Themes-3-161618) ![Mona Sans](https://img.shields.io/badge/Mona_Sans-variable-111111) ![Motion](https://img.shields.io/badge/Motion-12-FF008C) |
| Files / PDF | ![Uppy](https://img.shields.io/badge/Uppy-Dashboard-1269E5) ![EmbedPDF](https://img.shields.io/badge/EmbedPDF-viewer-1F2937) ![react--pdf](https://img.shields.io/badge/react--pdf-10-DC382D) ![JSZip](https://img.shields.io/badge/JSZip-export-F7DF1E) |
| Data / voice | ![Supabase](https://img.shields.io/badge/Supabase-js-3ECF8E?logo=supabase&logoColor=black) ![Zustand](https://img.shields.io/badge/Zustand-state-433E38) ![Vapi](https://img.shields.io/badge/Vapi-web-000000) |

## What this app does

- **Login**: Google (and Supabase session) via `signInWithOAuth`; session persisted; `AuthProvider` exchanges OAuth `code` when present, then loads `/auth/me`. Bearer token is auto-refreshed via `POST /auth/refresh` on 401.
- **Files**: List, upload (Uppy dashboard), open in viewers — PDFs in an EmbedPDF modal with a collapsible **summary panel** and **TTS audio playback**, images in a dedicated image viewer modal. Multi-select with Cmd/Ctrl-click and bulk delete; rename, delete and move-to-workspace from row menus or the toolbar.
- **Workspaces**: Folder-style navigation with workspace-scoped routes; rename / delete via a folder actions menu; the workspace page splits **chat** and **files** with a **draggable handle** (default 60/40, clamped to 30–60% chat width, double-click to reset, persisted in `localStorage`). The files panel has a refresh button that re-fetches without flashing the list.
- **Chat**: Workspace chat panel with copy on individual assistant / user messages, slash commands (`/quiz`, `/flashcards`, ask for "audio"), `@`-mentions of workspace files (chips render correctly even when filenames contain spaces), and drag-drop of file rows into the input to tag them. Assistant answers render code blocks, tables, source-file chips, and inline audio playback when the answer is in audio mode.
- **Study modes**: Three interaction modes the composer can lock into (manual via the picker, or auto-inferred from the question): **Quiz** cards (multiple choice with progress + a result card after submission), **Flashcard** decks (flip animation, themed palettes, keyboard navigation, **JSZip export** of the deck), and **Audio** answers (a `ChatSummaryAudioPlayer` rendered inline that streams the TTS of the answer / file summary). The active mode shows a chip above the composer with a one-click clear.
- **Search**: Semantic search bar in the top bar with thumbnail previews for image files and figure snippets for PDFs.
- **Recents & activity**: Recents page with a guidelines preview route; a timeline / activity page logs uploads, chats and searches.
- **Voice**: `@vapi-ai/web` session with a full-screen overlay (morphing gradient, glass transcript, streaming text without remount); metadata sends `userId`, optional `workspaceId`, `accessToken` for server tools; parses `<<<STACK_META>>>` from assistant text and tool results to render referenced files and run client actions (copy link, download file, delete, move to workspace, create + move to a new workspace).
- **Upload modal**: Uppy dashboard with workspace picker (and inline "create workspace" popover), file-quota awareness (per-user file count + per-file size cap), and a **URL import** field for HTML / PDF / image links.
- **Global link paste**: Pasting a URL anywhere in the app routes it through the URL-import flow into the currently-active workspace.
- **API client**: `VITE_API_URL` prefixes requests; `api-authed` attaches Bearer token and refreshes via `POST /auth/refresh` on 401; a file-sync event bus keeps the file lists across pages in sync after uploads, renames and deletes.

## Layout

```
frontend/
├── public/
├── src/
│   ├── auth/           # AuthProvider, useAuth, signInWithGoogle
│   ├── components/     # UI including workspace, voice overlay, chat, files, pdf, recents, ui
│   ├── hooks/          # useVapi, use-open-file, use-recent-files, use-image-thumbnail-urls,
│   │                   # use-pdf-extraction-preview-urls, use-browser-view-mode,
│   │                   # use-file-storage-summary, use-media-query
│   ├── layouts/
│   ├── lib/            # api, supabase, routes, vapi hints, stack meta parsing, file-sync events
│   ├── pages/          # Login, Recents, RecentsGuidelinesPreview, Timeline, Files,
│   │                   # Workspace, SectionPlaceholder, NotFound
│   ├── services/       # file, search, ask, url-ingest, workspace, conversation API helpers
│   ├── store/          # auth, upload, pdf-viewer, image-viewer, link-import-workspace
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
