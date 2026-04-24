-- CreateEnum
CREATE TYPE "ChunkContentType" AS ENUM ('text', 'table', 'image');

-- AlterTable
ALTER TABLE "file_chunks" ADD COLUMN "chunk_type" "ChunkContentType" NOT NULL DEFAULT 'text';
ALTER TABLE "file_chunks" ADD COLUMN "chunk_meta" JSONB;
