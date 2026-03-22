import { Router } from "express";
import { generateViral } from "../controllers/viralGeneratorController.js";

const router = Router();

router.post("/viral-generator", generateViral);

export default router;
