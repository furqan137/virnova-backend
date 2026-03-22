import { Router } from "express";
import { generateHooks } from "../controllers/aiController.js";

const router = Router();

router.post("/generate", generateHooks);

export default router;
