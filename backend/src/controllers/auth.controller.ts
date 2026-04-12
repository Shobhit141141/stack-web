import type { Request, Response } from "express";
import * as userService from "../services/user.service.js";

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
