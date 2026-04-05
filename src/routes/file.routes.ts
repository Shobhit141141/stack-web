import { Router } from "express";
import * as fileController from "../controllers/file.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadFileMemory } from "../middleware/multer.middleware.js";

const router = Router();

router.post("/files", requireAuth, uploadFileMemory, fileController.uploadFile);
router.get("/files/search", requireAuth, fileController.searchFiles);
router.get("/files", requireAuth, fileController.listFiles);
router.get("/files/:id", requireAuth, fileController.getFileById);

export default router;
