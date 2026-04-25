# Stack — Backend

Express 5 API on Node (ESM, TypeScript). **Postgres** holds users, files, chunks metadata, workspaces, conversations, chat messages and activity. **Supabase** verifies JWTs and stores file bytes (originals + thumbnails). **Qdrant** stores chunk vectors for semantic search and RAG retrieval, with image captions and PDF figure captions indexed alongside text. **Vapi** provides tool-calling: handles webhook requests for actions such as `apiCalls`, `askFiles` (RAG), and file operations (`download`, `copy`, `delete`, `move`).

| Tech | Badge |
|------|--------|
| Runtime | ![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white) |
| HTTP | ![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white) |
| ORM / DB | ![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white) |
| Search / AI | ![Qdrant](https://img.shields.io/badge/Qdrant-vectors-DC244C?logo=qdrant&logoColor=white) ![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?logo=openai&logoColor=white) ![Google AI](https://img.shields.io/badge/Google_GenAI-Gemini-4285F4?logo=google&logoColor=white) ![Tesseract](https://img.shields.io/badge/Tesseract.js-OCR-3776AB?logoColor=white) |
| Media | ![Sharp](https://img.shields.io/badge/Sharp-images-99CC00?logoColor=white) ![pdf-parse](https://img.shields.io/badge/pdf--parse-PDF-E2384D?logoColor=white) ![Mammoth](https://img.shields.io/badge/Mammoth-DOCX-2E5BB7?logoColor=white) |
| Auth / files | ![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=black) |
| Queue (optional) | ![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?logo=redis&logoColor=white) |

## API surface (high level)

Mounted under app root (no `/api` prefix in code):

| Prefix | Purpose |
|--------|---------|
| `GET /` | Health-style root |
| `GET /health` | Liveness (on `app`) |
| `/auth` | `GET /auth/me` (Bearer), `POST /auth/refresh` |
| `/file` | CRUD, multipart upload, `GET /file` list (paginated), `GET /file/search` (filename), `GET /file/recents`, `GET /file/storage-summary` (quota), `GET /file/:id` (signed URL), `GET /file/:id/download` (attachment stream), `GET /file/:id/thumbnail` (WebP), `GET /file/:id/summary/speech` (TTS audio), `GET /file/:id/pdf-extraction/:slot` (figure preview metadata), `PATCH /file/:id` (rename / move), `DELETE /file/:id` (queued), `POST /file/from-url` (URL ingest), `GET /file/url-jobs/:jobId` (job status) |
| `/workspace` | Create, list, rename, queued delete (cascading file removal) |
| `/conversation` | `GET /conversation/current` (per workspace), `GET /conversation/:id/messages` |
| `/search` | Semantic search (scoped by user; optional workspace) with image / PDF preview hints |
| `/ask` | RAG question over user files, optional `quiz` / `flashcards` / `audio` payloads; `POST /ask/quiz/submit` for quiz scoring |
| `/activity` | User activity feed (uploads, chats, searches) |
| `/vapi` | `POST /vapi/webhook` — Vapi tool-calls: `apiCalls` / `askFiles` (RAG), `stackFileAction` (download / copy / delete / move / rename, plus create-and-move-to new workspace) |

## Major backend behaviors

- **Auth**: `requireAuth` reads `Authorization: Bearer <access_token>`, validates with `supabase.auth.getUser`.
- **Ingest**: PDF / DOCX / image extraction, semantic chunking (target 300–500 tokens, 75-token overlap), embedding, Qdrant upsert; content dedup via `Content` hash so the same bytes uploaded twice share chunks and summary.
- **OCR**: Optional Tesseract.js pass over rasterized PDF pages (`OCR_ENABLED`), with an AI-vision fallback (`OCR_AI_FALLBACK`) for scanned PDFs that Tesseract can't recover.
- **Image understanding**: WebP thumbnails generated with Sharp; image files get a vision-LLM caption indexed for search; embedded PDF figures can be extracted, captioned and indexed (`PDF_EMBEDDED_IMAGES_ENABLED`).
- **Summaries**: A short LLM summary is generated per content hash, surfaced in the UI, and can be turned into TTS audio on request (cached on the `Content` row).
- **RAG**: Retrieves chunks above a configurable score floor; completion via OpenAI or Google; post-processing for citations and "not found" guards; quiz / flashcard / audio payloads are produced inline when the user asks (the audio mode reuses the per-content summary speech endpoint so the TTS is cached on the `Content` row); optional debug file logging.
- **Summary**: A short LLM summary is generated per content hash, surfaced in the UI, and can be turned into TTS audio on request (cached on the `Content` row).
- **RAG Features**: Quiz / flashcard / audio payloads are produced inline when the user asks (the audio mode reuses the per-content summary speech endpoint so the TTS is cached on the `Content` row); optional debug file logging.
  - Quiz: Multiple-choice with a result card after submission
  - Flashcards: Themed deck with keyboard navigation and zip export
  - Audio: An inline TTS player generated from the answer / file summary
- **Semantic search**: Same embedding path as RAG; image and PDF chunks return preview hints so the UI can render thumbnails / figure snippets; filename fallback when no chunk hits.
- **Deletion queue**: File and workspace deletes are queued (`delete-queue.service`) so large workspaces clear in the background without blocking the request; status is tracked per job.
- **Vapi**: Merges `userId`, `workspaceId`, `accessToken` from call metadata; appends base64url `STACK_META` JSON for sources and `clientAction` (e.g. `copyText`, `downloadFile`, `moveFile`); a smaller / faster chat model is used for voice (`OPENAI_CHAT_MODEL_VOICE`).
- **URL ingest worker** (optional): If `REDIS_URL` is set and `START_URL_INGEST_WORKER` is not `false` (defaults on), the API process starts a BullMQ worker for URL-ingest jobs (HTML readability, PDF, image), with SSRF protection and configurable size / timeout limits. You can also run `npm run dev:url-worker` / `start:url-worker` separately.

## Layout

```
backend/
├── prisma/             # schema, migrations
├── src/
│   ├── client/         # supabase, openai/google clients
│   ├── config/         # env
│   ├── controllers/
│   ├── middleware/
│   ├── queue/          # BullMQ queues + Redis connection
│   ├── rag/            # prompts (ask, quiz, flashcards)
│   ├── repositories/
│   ├── routes/
│   ├── services/       # ask, file, search, extraction, summary, image-thumbnail, vapi actions, …
│   ├── utils/          # logger, OCR, image captions, debug logs, vapi meta, tokenizer
│   ├── vector-store/
│   ├── workers/        # url-ingest worker
│   ├── app.ts
│   └── index.ts
├── logs/               # optional debug log files (gitignored in practice)
└── package.json
```

## Environment

Copy `.env.example` → `.env`. Minimum concepts:

- **Postgres**: `DATABASE_URL`, `DIRECT_URL` (Prisma).
- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, storage bucket name.
- **Qdrant**: `QDRANT_URL`, `QDRANT_COLLECTION` (default `file_chunks`), optional API key.
- **Models**: `EMBEDDING_PROVIDER` + OpenAI or Google keys/models; `RAG_COMPLETION_PROVIDER` + chat model envs; `OPENAI_CHAT_MODEL_VOICE` for the lower-latency Vapi path.
- **RAG tuning**: `RAG_VECTOR_CHUNK_LIMIT`, `RAG_TOP_CONTENT_COUNT`, `RAG_MAX_CHUNKS_PER_CONTENT`, `RAG_MIN_CHUNK_SCORE`, `RAG_MAX_CONTEXT_CHARS`, `RAG_TEMPERATURE`.
- **OCR / images**: `OCR_ENABLED`, `OCR_MAX_PAGES`, `OCR_AI_FALLBACK`, `PDF_EMBEDDED_IMAGES_ENABLED`, `PDF_EXTRACT_CACHE_DIR`.
- **URL ingest**: `REDIS_URL`, `START_URL_INGEST_WORKER`, `URL_FETCH_MAX_BYTES`, `URL_FETCH_TIMEOUT_MS`.
- **Server**: `PORT` (default `3000`); `CORS_ORIGIN` in production (comma-separated allowed origins, including any `chrome-extension://<id>` you ship).

Production boot fails fast if required env vars are missing (`backend/src/config/env.ts`).

## Scripts

```bash
npm install
npm run dev                 # tsx watch src/index.ts
npm run build               # prisma generate && tsc → dist/
npm run typecheck
npx prisma migrate dev      # local DB migrations
npx prisma migrate deploy   # CI / production migrate
npm run dev:url-worker      # optional URL ingest worker
```

## Logs

Structured Winston logs to stdout; optional **file** debug logs for Vapi / RAG / semantic search / OCR under `logs/` when those code paths run (see `src/utils/debug-log.util.ts`).

## Future plans

- Broader document parsers and explicit MIME support matrix in API docs.
- Rate limits and payload size policy per route class.
- Queue metrics and dead-letter handling for URL ingest and deletion queues.
- Optional OpenAPI spec generated from route handlers.
