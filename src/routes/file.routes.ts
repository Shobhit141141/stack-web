import { Router } from "express";
import * as fileController from "../controllers/file.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadFileMemory } from "../middleware/multer.middleware.js";

const router = Router();

router.post("/", requireAuth, uploadFileMemory, fileController.uploadFile);
router.get("/search", requireAuth, fileController.searchFiles);
router.get("/", requireAuth, fileController.listFiles);
router.get("/:id", requireAuth, fileController.getFileById);

export default router;
