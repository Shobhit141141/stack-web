import { Router } from "express";
import * as homeController from "../controllers/home.controller.js";

const router = Router();
router.get("/", homeController.getRoot);

export default router;
