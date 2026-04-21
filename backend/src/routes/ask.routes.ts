import { Router } from "express";
import * as askController from "../controllers/ask.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", requireAuth, askController.postAsk);
router.post("/quiz/submit", requireAuth, askController.postQuizSubmit);

export default router;
