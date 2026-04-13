import type { User } from "@prisma/client";
import { prisma } from "./db.js";

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function userNameExists(userName: string): Promise<boolean> {
  const row = await prisma.user.findUnique({
    where: { userName },
    select: { id: true },
  });
  return row !== null;
}

export async function createUser(data: {
  id: string;
  email: string;
  userName: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<User> {
  return prisma.user.create({ data });
}

export async function updateUserProfileFields(
  id: string,
  data: { displayName: string | null; avatarUrl: string | null }
): Promise<User> {
  return prisma.user.update({ where: { id }, data });
}
