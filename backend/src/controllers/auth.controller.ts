import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";

export async function postRefresh(req: Request, res: Response) {
  const body = req.body as { refresh_token?: unknown };
  const refreshToken =
    typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (!refreshToken) {
    res.status(400).json({ error: "refresh_token required" });
    return;
  }
  try {
    const session = await authService.refreshSessionWithToken(refreshToken);
    if (!session) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }
    res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(400).json({ error: message });
  }
}

export async function getMe(req: Request, res: Response) {
  const authUser = req.supabaseAuthUser;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const profile = await userService.getMeProfile(authUser);
    res.json(profile);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(400).json({ error: message });
  }
}
