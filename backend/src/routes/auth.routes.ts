import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.post("/refresh", authController.postRefresh);
router.get("/me", requireAuth, authController.getMe);

export default router;
