<div align="center">

<img src="/frontend/public/image.png" alt="Project Logo" width="120" height="120">

# STACK
### Context over storage

</div>
  

**Stack** is a platform focused on helping you manage, search, and interact with your documents. 

It supports uploading your files, organizing them into workspaces, running semantic searches, chatting over your content using retrieval augmented generation (RAG), and even talking to your files with a voice assistant layer (Vapi). 

The project aims to make working with your files smarter and more interactive, blending powerful search and AI features in one experience.

| Area | Stack |
|------|-------|
| API | ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=for-the-badge&logo=typescript&logoColor=white) ![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white) |
| AI | ![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white) ![Gemini](https://img.shields.io/badge/Gemini-2.0-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) ![Vapi](https://img.shields.io/badge/Vapi-Voice%20AI-5B4FBE?style=for-the-badge&logoColor=white) |
| Data | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=black) ![Qdrant](https://img.shields.io/badge/Qdrant-vectors-DC244C?style=for-the-badge&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-FF4438?style=for-the-badge&logo=redis&logoColor=white) |
| UI | ![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) ![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radixui&logoColor=white)|

## Repository layout

```
stack-fix/
├── README.md
├── package.json                 # installs / dev / build for both apps
├── backend/
│   ├── prisma/                  # database schema and migrations
│   ├── public/                  # static helpers (e.g. auth test page)
│   ├── scripts/                 # one-off scripts (tokens, test PDFs, …)
│   ├── src/
│   │   ├── client/              # outbound API clients (Supabase, OpenAI, Google)
│   │   ├── config/              # environment and app config
│   │   ├── constants/           # shared constants (upload types, embeddings)
│   │   ├── controllers/         # HTTP handlers (thin)
│   │   ├── middleware/          # auth, CORS, upload, errors, logging
│   │   ├── queue/               # BullMQ queues and Redis connection (URL ingest)
│   │   ├── rag/                 # prompts for “ask your files”
│   │   ├── repositories/        # database access (Prisma)
│   │   ├── routes/              # route tables wired to controllers
│   │   ├── services/            # business logic (files, ask, search, voice actions, …)
│   │   ├── types/               # shared TypeScript types
│   │   ├── utils/               # helpers (logging, extraction, debug logs, …)
│   │   ├── vector-store/        # chunk storage and similarity search (Qdrant)
│   │   ├── views/               # tiny HTML/JSON views where used
│   │   ├── workers/             # background workers (URL ingest, …)
│   │   ├── app.ts               # Express app assembly
│   │   └── index.ts             # process entry (listen, startup checks)
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── public/                  # static assets (icons, …)
    ├── src/
    │   ├── auth/                # sign-in, sign-out, session wiring
    │   ├── components/          # UI (sidebar, files, workspaces, voice, chat, upload)
    │   ├── hooks/               # voice, file open, recents, …
    │   ├── layouts/             # shell layout for logged-in routes
    │   ├── lib/                 # routes, API helpers, Supabase, Vapi hints, meta parsing
    │   ├── pages/               # home, login, files, workspaces, timeline, chats, …
    │   ├── services/            # typed calls to backend endpoints
    │   ├── store/               # client state (auth, upload, PDF viewer, …)
    │   ├── types/               # shared frontend types
    │   ├── utils/               # small UI helpers
    │   ├── index.css
    │   ├── main.tsx             # React mount
    │   └── router.tsx           # page routes and auth gates
    ├── vercel.json              # SPA fallback so deep links (e.g. /login) work on deploy
    ├── vite.config.ts
    ├── package.json
    └── .env.example
```

## Major features (implemented)

- **Sign in** — Continue with Google; session stays in the browser between visits.
- **File library** — Upload PDF and Word documents; rename, delete, move between workspaces, open in the viewer, see recents and trash-related flows where the UI exposes them.
- **Downloads and links** — Download a file as a real download (not only a preview tab). In voice mode, copy a link or download from the file strip; the assistant can trigger the same actions when you ask.
- **Workspaces** — Create workspaces, assign files to them, browse by folder, and keep chat scoped to the workspace you are in.
- **Ask in chat** — Ask natural-language questions; answers use your uploaded documents and point at file names in a consistent way so the UI can highlight them.
- **Semantic search** — Search by what documents *say*, not only exact titles; if nothing matches strongly, the app can still suggest files by name when that helps.
- **Voice** — Hands-free questions about your files, see which files were used for an answer, and run file actions (copy link, download, delete) from the same session when you ask.
- **Activity** — See a timeline of what you did in the app (uploads, chats, searches).
- **Import from URL** — Add a document from a web link when the server is configured with a queue worker (optional).

## Prerequisites

- Node.js 18+ (use current LTS in production).
- PostgreSQL (Prisma migrations).
- Supabase project (Auth + Storage bucket).
- Qdrant (local or cloud) for chunk vectors.
- API keys for chosen embedding / chat providers (`backend/.env.example`).

## Setup (local)

1. **Install**

   ```bash
   npm run install:all
   ```

2. **Backend** — copy `backend/.env.example` → `backend/.env`, set `DATABASE_URL`, `DIRECT_URL`, Supabase, Qdrant, and model keys. Run migrations:

   ```bash
   cd backend && npx prisma migrate dev
   ```

3. **Frontend** — copy `frontend/.env.example` → `frontend/.env.local` (or `.env`), set `VITE_API_URL` to the API origin (e.g. `http://localhost:3000`), Supabase URL + anon key.

4. **Run**

   ```bash
   npm run dev:backend    # one terminal
   npm run dev:frontend   # another
   ```

   Or `npm run dev:all` from root (starts both).

5. **Production SPA routing** — the frontend ships `frontend/vercel.json` so client routes like `/login` resolve to `index.html`. Deploy the **frontend** project with root `frontend` (or equivalent) so that file is applied.

## Root scripts

| Script | Purpose |
|--------|---------|
| `npm run install:all` | Install `backend` and `frontend` dependencies |
| `npm run dev:backend` | API dev server (`tsx watch`) |
| `npm run dev:frontend` | Vite dev server |
| `npm run build:backend` | `tsc` compile |
| `npm run build:frontend` | `tsc -b` + Vite production build |
| `npm run typecheck:backend` | Backend typecheck only |

## Documentation per package

- [backend/README.md](./backend/README.md) — API surface, env, workers, logs.
- [frontend/README.md](./frontend/README.md) — UI routes, env, Vercel, voice.

## Future plans (non-binding)

- Wider ingest types and clearer indexing coverage for all upload MIME types.
- Stronger observability (metrics, structured tracing) beyond file-based debug logs.
- Streaming RAG responses and tighter latency budgets for voice.
- Hardening of OAuth redirect and SPA hosting checks in CI.
- Optional PWA / offline read-only cache (not implemented).
