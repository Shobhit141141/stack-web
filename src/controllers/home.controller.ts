import type { Request, Response } from "express";
import * as homeView from "../views/home.view.js";

export function getRoot(_req: Request, res: Response) {
  res.json(homeView.rootPayload());
}
