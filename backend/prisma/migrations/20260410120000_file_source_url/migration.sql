-- AlterTable
ALTER TABLE "files" ADD COLUMN "source_type" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "files" ADD COLUMN "source_url" TEXT;
