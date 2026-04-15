import { Router } from "express";
import * as conversationController from "../controllers/conversation.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/current", requireAuth, conversationController.getCurrentConversation);
router.get("/:id/messages", requireAuth, conversationController.getConversationMessages);

export default router;
