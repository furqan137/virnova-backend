import { Router } from "express";
import { generateScriptFromLlm } from "../controllers/scriptController.js";
import { generateScriptFromTrend } from "../controllers/trendScriptController.js";

const router = Router();

router.post("/generate-script", generateScriptFromLlm);
router.post("/generate-script-from-trend", generateScriptFromTrend);

export default router;
