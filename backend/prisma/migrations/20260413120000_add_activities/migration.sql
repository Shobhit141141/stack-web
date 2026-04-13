-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('upload', 'chat', 'search');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_user_id_idx" ON "activities"("user_id");

-- CreateIndex
CREATE INDEX "activities_created_at_idx" ON "activities"("created_at");

-- CreateIndex
CREATE INDEX "activities_user_id_created_at_idx" ON "activities"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
