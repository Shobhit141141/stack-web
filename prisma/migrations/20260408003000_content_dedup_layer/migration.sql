-- CreateTable
CREATE TABLE "contents" (
    "id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contents_hash_key" ON "contents"("hash");

-- Add content_id to files (nullable for backfill)
ALTER TABLE "files" ADD COLUMN "content_id" UUID;

-- Backfill contents from existing files
INSERT INTO "contents" ("id", "hash")
SELECT f.id, 'legacy-file-' || f.id::text
FROM "files" f;

-- Connect each existing file to a unique content row
UPDATE "files" f
SET "content_id" = c."id"
FROM "contents" c
WHERE c."hash" = 'legacy-file-' || f."id"::text;

-- Make files.content_id required and indexed
ALTER TABLE "files" ALTER COLUMN "content_id" SET NOT NULL;
CREATE INDEX "files_content_id_idx" ON "files"("content_id");

-- Rewire file_chunks from file_id -> content_id
ALTER TABLE "file_chunks" DROP CONSTRAINT "file_chunks_file_id_fkey";
ALTER TABLE "file_chunks" RENAME COLUMN "file_id" TO "content_id";
DROP INDEX "file_chunks_file_id_idx";
CREATE INDEX "file_chunks_content_id_idx" ON "file_chunks"("content_id");

-- Backfill chunk content_id from files linkage
UPDATE "file_chunks" fc
SET "content_id" = f."content_id"
FROM "files" f
WHERE fc."content_id" = f."id";

-- Add foreign keys
ALTER TABLE "files" ADD CONSTRAINT "files_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
