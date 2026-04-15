import { Router } from "express";
import * as homeController from "../controllers/home.controller.js";
import activityRoutes from "./activity.routes.js";
import askRoutes from "./ask.routes.js";
import authRoutes from "./auth.routes.js";
import conversationRoutes from "./conversation.routes.js";
import fileRoutes from "./file.routes.js";
import searchRoutes from "./search.routes.js";
import vapiRoutes from "./vapi.routes.js";
import workspaceRoutes from "./workspace.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/activity", activityRoutes);
router.use("/files", fileRoutes);
router.use("/workspaces", workspaceRoutes);
router.use("/conversations", conversationRoutes);
router.use("/search", searchRoutes);
router.use("/ask", askRoutes);
router.use("/vapi", vapiRoutes);
router.get("/", homeController.getRoot);

export default router;
