-- vectors moved to qdrant; postgres keeps chunk text + metadata only
ALTER TABLE "file_chunks" DROP COLUMN IF EXISTS "embedding";
