import cors from "cors";
import { env } from "../config/env.js";

export const corsMiddleware = cors({
  credentials: true,
  allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  origin(origin, callback) {
    const allowList = env.CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowList?.length) {
      if (!origin || allowList.includes(origin)) {
        callback(null, origin ?? allowList[0]);
        return;
      }
      callback(new Error("Not allowed by CORS"));
      return;
    }

    if (!env.IS_PRODUCTION) {
      callback(null, origin ?? true);
      return;
    }

    callback(null, false);
  },
});
