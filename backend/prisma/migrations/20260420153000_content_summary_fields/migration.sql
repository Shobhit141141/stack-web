-- CreateEnum
CREATE TYPE "ContentSummaryStatus" AS ENUM ('pending', 'ready', 'failed');

-- AlterTable
ALTER TABLE "contents"
ADD COLUMN "summary" TEXT,
ADD COLUMN "summary_status" "ContentSummaryStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "summary_updated_at" TIMESTAMP(3);
