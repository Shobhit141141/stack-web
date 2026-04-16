# Stack — Backend

Express 5 API on Node (ESM, TypeScript). **Postgres** holds users, files, chunks metadata, workspaces, conversations. **Supabase** verifies JWTs and stores file bytes. **Qdrant** stores chunk vectors for semantic search and RAG retrieval. **Vapi** provides tool-calling: handles webhook requests for actions such as `apiCalls`, `askFiles` (RAG), and file operations (`copy`, `download`, etc).

| Tech | Badge |
|------|--------|
| Runtime | ![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white) |
| HTTP | ![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white) |
| ORM / DB | ![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white) |
| Search / AI | ![Qdrant](https://img.shields.io/badge/Qdrant-vectors-DC244C?logo=qdrant&logoColor=white) ![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white) ![Google AI](https://img.shields.io/badge/Google_GenAI-Gemini-4285F4?logo=google&logoColor=white) |
| Auth / files | ![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=black) |
| Queue (optional) | ![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?logo=redis&logoColor=white) |

## API surface (high level)

Mounted under app root (no `/api` prefix in code):

| Prefix | Purpose |
|--------|---------|
| `GET /` | Health-style root |
| `GET /health` | Liveness (on `app`) |
| `/auth` | `GET /auth/me` (Bearer), `POST /auth/refresh` |
| `/files` | CRUD, upload, signed URL, `GET /files/:id/download` (attachment stream) |
| `/workspaces` | Workspace CRUD |
| `/conversations` | Current conversation + messages |
| `/search` | Semantic search (scoped by user; optional workspace) |
| `/ask` | RAG question over user files |
| `/activity` | User activity feed |
| `/vapi` | `POST /vapi/webhook` — Vapi tool-calls: `apiCalls` / `askFiles` (RAG), `stackFileAction` (download / copy / delete / move) |

## Major backend behaviors

- **Auth**: `requireAuth` reads `Authorization: Bearer <access_token>`, validates with `supabase.auth.getUser`.
- **Ingest**: PDF/DOCX extraction, chunking, embedding, Qdrant upsert; content dedup via `Content` hash where applicable.
- **RAG**: Retrieves chunks above configurable score floor; completion via OpenAI or Google; post-processing for citations and “not found” guards; optional debug file logging.
- **Semantic search**: Same embedding path and score alignment with RAG where configured; filename fallback when no chunk hits.
- **Vapi**: Merges `userId`, `workspaceId`, `accessToken` from call metadata; appends base64url `STACK_META` JSON for sources and `clientAction` (e.g. `copyText`, `downloadFile`).
- **URL ingest worker** (optional): If `REDIS_URL` is set and `START_URL_INGEST_WORKER` is not `false` (defaults on), the API process starts a BullMQ worker for URL-ingest jobs. You can also run `npm run dev:url-worker` / `start:url-worker` separately.

## Layout

```
backend/
├── prisma/             # schema, migrations
├── src/
│   ├── client/         # supabase, openai/google clients
│   ├── config/         # env
│   ├── controllers/
│   ├── middleware/
│   ├── rag/
│   ├── repositories/
│   ├── routes/
│   ├── services/       # ask, file, search, extraction, vapi actions, …
│   ├── utils/          # logger, debug logs, vapi meta
│   ├── vector-store/
│   ├── workers/
│   ├── app.ts
│   └── index.ts
├── logs/               # optional debug log files (gitignored in practice)
└── package.json
```

## Environment

Copy `.env.example` → `.env`. Minimum concepts:

- **Postgres**: `DATABASE_URL`, `DIRECT_URL` (Prisma).
- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, storage bucket name.
- **Qdrant**: `QDRANT_URL`, collection, optional API key.
- **Models**: `EMBEDDING_PROVIDER` + OpenAI or Google keys/models; `RAG_COMPLETION_PROVIDER` + chat model envs.
- **Server**: `PORT` (default `3000`); `CORS_ORIGIN` in production (comma-separated allowed origins).
- **Optional**: `REDIS_URL`, `START_URL_INGEST_WORKER`, OCR flags — see `.env.example`.

Production boot fails fast if required env vars are missing (`backend/src/config/env.ts`).

## Scripts

```bash
npm install
npm run dev                 # tsx watch src/index.ts
npm run build               # tsc → dist/ (or emit per tsconfig)
npm run typecheck
npx prisma migrate dev      # local DB migrations
npx prisma migrate deploy   # CI / production migrate
npm run dev:url-worker      # optional URL ingest worker
```

## Logs

Structured Winston logs to stdout; optional **file** debug logs for Vapi / RAG / semantic search under `logs/` when those code paths run (see `src/utils/debug-log.util.ts`).

## Future plans

- Broader document parsers and explicit MIME support matrix in API docs.
- Rate limits and payload size policy per route class.
- Queue metrics and dead-letter handling for URL ingest.
- Optional OpenAPI spec generated from route handlers.
