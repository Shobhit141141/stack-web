-- L2 distance (<->) queries; lists tuned for moderate corpus size (adjust as data grows)
CREATE INDEX IF NOT EXISTS "file_chunks_embedding_ivfflat_idx"
ON "file_chunks"
USING ivfflat ("embedding" vector_l2_ops)
WITH (lists = 10);
