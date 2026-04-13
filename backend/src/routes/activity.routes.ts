import { Router } from "express";
import * as activityController from "../controllers/activity.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, activityController.getActivity);

export default router;
