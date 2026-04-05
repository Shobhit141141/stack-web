import { Router } from "express";
import * as fileController from "../controllers/file.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadFileMemory } from "../utils/multer.js";

const router = Router();
router.post("/files", requireAuth, uploadFileMemory, fileController.uploadFile);

export default router;
