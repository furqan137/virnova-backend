import { Router } from "express";
import {
  analyzeViralContent,
  generateViralContent
} from "../controllers/viralContentController.js";

const router = Router();

router.post("/analyze", analyzeViralContent);
router.post("/generate", generateViralContent);

export default router;
