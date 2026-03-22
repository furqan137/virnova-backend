import { Router } from "express";
import { generateScript, generateCaptionHashtags } from "../controllers/aiController.js";

const router = Router();

router.post("/generate", generateScript);
router.post("/caption-hashtags", generateCaptionHashtags);

export default router;
