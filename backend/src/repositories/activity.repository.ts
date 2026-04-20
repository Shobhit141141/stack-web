import { type ActivityType, Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export type ActivityListRow = {
  id: string;
  type: ActivityType;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export async function insertActivity(data: {
  userId: string;
  type: ActivityType;
  metadata: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.activity.create({ data });
}

export async function listActivities(
  where: Prisma.ActivityWhereInput,
  take: number
): Promise<ActivityListRow[]> {
  return prisma.activity.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      type: true,
      metadata: true,
      createdAt: true,
    },
  });
}

// removes upload timeline rows that pointed at this file (metadata.fileId json path).
export async function deleteUploadActivitiesForFile(
  userId: string,
  fileId: string
): Promise<void> {
  await prisma.activity.deleteMany({
    where: {
      userId,
      type: "upload",
      metadata: {
        path: ["fileId"],
        equals: fileId,
      },
    },
  });
}

export async function deleteUploadActivitiesForFiles(
  userId: string,
  fileIds: string[]
): Promise<void> {
  if (fileIds.length === 0) return;
  await prisma.$executeRaw`
    DELETE FROM "activities"
    WHERE "user_id" = ${userId}::uuid
      AND "type" = 'upload'
      AND ("metadata"->>'fileId') IN (${Prisma.join(
        fileIds.map((id) => Prisma.sql`${id}`)
      )})
  `;
}

// timeline rows tagged with this workspace (upload/chat/search metadata.workspaceId).
export async function deleteActivitiesForWorkspace(
  userId: string,
  workspaceId: string
): Promise<void> {
  await prisma.activity.deleteMany({
    where: {
      userId,
      metadata: {
        path: ["workspaceId"],
        equals: workspaceId,
      },
    },
  });
}
