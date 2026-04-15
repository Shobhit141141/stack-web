import { Router } from "express";
import * as workspaceController from "../controllers/workspace.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, workspaceController.listWorkspaces);
router.post("/", requireAuth, workspaceController.postWorkspace);
router.patch("/:id", requireAuth, workspaceController.patchWorkspace);
router.delete("/:id", requireAuth, workspaceController.deleteWorkspace);

export default router;
