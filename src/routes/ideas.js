import { Router } from "express";
import { generateIdeas } from "../controllers/aiController.js";

const router = Router();

router.post("/generate", generateIdeas);

export default router;
