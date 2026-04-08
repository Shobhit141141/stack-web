-- DropIndex
DROP INDEX "file_chunks_embedding_ivfflat_idx";

-- RenameIndex
ALTER INDEX "files_original_name_idx" RENAME TO "files_name_idx";
