import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import * as userRepository from "../repositories/user.repository.js";

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);
  return slug || "user";
}

async function allocateUniqueUserName(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 8; i++) {
    const taken = await userRepository.userNameExists(candidate);
    if (!taken) return candidate;
    const suffix = randomBytes(3).toString("hex");
    candidate = `${base.slice(0, Math.max(1, 20))}_${suffix}`;
  }
  throw new Error("Could not allocate userName");
}

function profileFromMetadata(user: SupabaseAuthUser): {
  displayName: string | null;
  avatarUrl: string | null;
} {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : null;
  const avatarUrl =
    typeof meta?.avatar_url === "string"
      ? meta.avatar_url
      : typeof meta?.picture === "string"
        ? meta.picture
        : null;
  return { displayName, avatarUrl };
}

export async function getOrCreateUserFromSupabase(
  supabaseUser: SupabaseAuthUser
): Promise<User> {
  const email = supabaseUser.email;
  if (!email) {
    throw new Error("Authenticated user has no email");
  }

  const existing = await userRepository.findUserById(supabaseUser.id);
  if (existing) {
    const { displayName, avatarUrl } = profileFromMetadata(supabaseUser);
    const nextDisplayName =
      displayName !== null && displayName !== existing.displayName
        ? displayName
        : existing.displayName;
    const nextAvatarUrl =
      avatarUrl !== null && avatarUrl !== existing.avatarUrl
        ? avatarUrl
        : existing.avatarUrl;
    if (
      nextDisplayName !== existing.displayName ||
      nextAvatarUrl !== existing.avatarUrl
    ) {
      return userRepository.updateUserProfileFields(existing.id, {
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
      });
    }
    return existing;
  }

  const base = slugFromEmail(email);
  const userName = await allocateUniqueUserName(base);
  const { displayName, avatarUrl } = profileFromMetadata(supabaseUser);

  try {
    return await userRepository.createUser({
      id: supabaseUser.id,
      email,
      userName,
      displayName,
      avatarUrl,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const again = await userRepository.findUserById(supabaseUser.id);
      if (again) return again;
    }
    throw e;
  }
}

export function toPublicUserDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    userName: user.userName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export async function getMeProfile(
  supabaseUser: SupabaseAuthUser
): Promise<ReturnType<typeof toPublicUserDto>> {
  const user = await getOrCreateUserFromSupabase(supabaseUser);
  return toPublicUserDto(user);
}
