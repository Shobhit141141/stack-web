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
