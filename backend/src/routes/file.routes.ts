import { Router } from "express";
import * as fileController from "../controllers/file.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadFileMemory } from "../middleware/multer.middleware.js";

const router = Router();

router.post("/from-url", requireAuth, fileController.createFileFromUrl);
router.get(
  "/url-jobs/:jobId",
  requireAuth,
  fileController.getUrlIngestJobStatus
);
router.post("/", requireAuth, uploadFileMemory, fileController.uploadFile);
router.get("/search", requireAuth, fileController.searchFiles);
router.get("/recents", requireAuth, fileController.listRecentFiles);
router.get("/", requireAuth, fileController.listFiles);
router.patch("/:id", requireAuth, fileController.patchFile);
router.delete("/:id", requireAuth, fileController.deleteFile);
router.get("/:id", requireAuth, fileController.getFileById);

export default router;
