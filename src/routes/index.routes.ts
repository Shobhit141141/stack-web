import { Router } from "express";
import * as homeController from "../controllers/home.controller.js";
import askRoutes from "./ask.routes.js";
import authRoutes from "./auth.routes.js";
import fileRoutes from "./file.routes.js";
import searchRoutes from "./search.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/files", fileRoutes);
router.use("/search", searchRoutes);
router.use("/ask", askRoutes);
router.get("/", homeController.getRoot);

export default router;
