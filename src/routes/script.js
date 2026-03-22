import { Router } from "express";
import { generateScriptFromLlm } from "../controllers/scriptController.js";

const router = Router();

router.post("/generate-script", generateScriptFromLlm);

export default router;
