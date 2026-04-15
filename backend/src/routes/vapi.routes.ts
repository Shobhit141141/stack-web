import { Router } from "express";
import * as vapiController from "../controllers/vapi.controller.js";

const router = Router();

// Vapi sends POST requests to this webhook for function calls
router.post("/webhook", vapiController.vapiWebhook);

export default router;
