# Multimodal RAG upgrade — roadmap

## End goal

- All document content is **searchable and usable**.
- Support **text**, **tables**, and **images** (via structured / captioned representation).
- Unified pipeline:

```text
Extract → Normalize → Embed → Retrieve → Answer → Act
```

## Core requirements

### 1. Text processing (existing)

- Extract text from PDF/DOCX.
- Chunk into semantic units.
- Generate embeddings.
- Store in vector DB (Postgres `file_chunks` + Qdrant).

### 2. Table handling

- Detect tables during extraction (or approximate with layout-aware parsers).
- Convert tables → structured text (e.g. row/column lines) for embedding.
- Feed through the same chunking + embedding pipeline.

### 3. Image handling (caption-based)

**Extraction**

- Extract embedded images from PDFs (and relevant DOCX parts if applicable).

**Captioning**

- Generate short descriptive captions per image (vision model or dedicated caption API).

**Storage**

- Treat captions as normal text chunks for retrieval.
- Tag chunks with `type: image` (and optional `assetRef` for preview).

### 4. (Optional) Image embeddings

- Embed image pixels / thumbnails with a multimodal embedding model.
- Store in the same or a parallel vector collection with type tagging.
- Enables text ↔ image semantic matching beyond captions.

### 5. Unified retrieval layer

- Query → embedding (text query today; optionally query image or dual encoder later).
- Retrieve: text chunks, table-derived chunks, image captions (and optional image vectors).
- Rank / fuse results (simple merge + score, or RRF / reranker later).

### 6. Response generation

- Pass mixed retrieved context into the existing RAG completion path.
- Keep answers grounded; surface **sources** with type + file reference.

### 7. UI (minimal)

- Source list: indicators for **text / table / image**.
- Preview: text highlight; table structured snippet; image thumbnail when `assetRef` exists.

### 8. Metadata and schema

Each logical chunk should carry at least:

- `fileId` / `contentId` (already content-scoped today).
- `type`: `text` | `table` | `image`.
- `content` (string stored in DB + mirrored to Qdrant payload).
- `embedding`.

Optional:

- `source`: `parsed` | `ocr` | `caption`.
- `page`, `bbox`, `imageStoragePath` for UI and debugging.

## System principles

- **Extend** the current pipeline; avoid a full rewrite.
- Prefer **deterministic, simple** transforms (table → rows of text) before heavy ML.
- Optimize for **retrieval quality** over maximum complexity.
- Treat everything retrievable as **searchable context** for the same RAG loop.

## Outcome

- Files contribute **text, structured table strings, and image semantics** (captions and optionally vectors).
- Retrieval and answers can use **mixed context** with clear provenance.

---

## Appendix — current codebase alignment

| Area | Today | Notes |
|------|--------|--------|
| PDF text | `backend/src/utils/extraction/pdf.util.ts` (`pdf-parse`) | Text layer only; figures often missing. |
| OCR | `backend/src/utils/extraction/ocr.util.ts` | Stub (`tryOcrPdf` returns `null`); `OCR_ENABLED` in `extraction.service.ts` gates a future hook. |
| Chunk rows | `backend/prisma/schema.prisma` → `FileChunk`: `content`, `chunk_index`, `token_count` | **No `type` or image ref yet** — add columns + extend `ChunkInsertRow` / `replaceContentChunks` raw SQL. |
| Chunking | `backend/src/services/chunking.service.ts` | Paragraph / sentence / token splits on **plain string**. |
| Indexing | `backend/src/services/document-index.service.ts` + `chunk.repository.ts` | Single text stream in → chunks out. |
| Retrieval | `backend/src/services/ask.service.ts` + vector search | Sources today are file-level from chunk hits; extend payloads for `type` + preview fields. |

### Suggested implementation phases

1. **Schema + plumbing** — Add `chunk_type` (and optional JSON `chunk_meta`) on `file_chunks`; propagate through Prisma, `replaceContentChunks`, Qdrant payload if used; default `text` for all existing rows.
2. **Tables** — Post-process `pdf-parse` output or add a PDF layout library / table detector; emit `type: table` chunks as normalized lines.
3. **Images** — Extract images from PDF buffers; caption; insert chunks `type: image`; store image bytes or paths in Supabase keyed by chunk/file.
4. **Retrieval + UI** — Merge ranked lists; show type badges; optional image preview URL in source cards.

This document is the product roadmap; implement phase-by-phase behind flags to avoid blocking current uploads.
