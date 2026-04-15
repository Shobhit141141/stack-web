import type { NextFunction, Request, Response } from "express";
import { getAuthUser } from "../services/auth.service.js";
import { log } from "../utils/logger/index.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    log.warn(
      `401 ${req.method} ${req.originalUrl} — missing Authorization: Bearer <access_token>`
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    log.warn(`401 ${req.method} ${req.originalUrl} — empty Bearer token`);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await getAuthUser(token);
    if (!user) {
      log.warn(`401 ${req.method} ${req.originalUrl} — invalid or expired session`);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.supabaseAuthUser = user;
    req.user = { id: user.id };
    req.accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

