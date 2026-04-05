import type { NextFunction, Request, Response } from "express";
import { getAuthUser } from "../services/auth.service.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await getAuthUser(token);
    if (!user) {
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
