import { Router } from "express";
import { analyzeViralContent } from "../controllers/analyzeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/", requireAuth, analyzeViralContent);

export default router;
