-- AlterTable
ALTER TABLE "files" ADD COLUMN "last_opened_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "files_user_id_last_opened_at_idx" ON "files"("user_id", "last_opened_at" DESC);
