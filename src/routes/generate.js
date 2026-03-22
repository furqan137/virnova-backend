import express from "express";
import { generateAI } from "../controllers/aiController.js";

const router = express.Router();

router.post("/generate", generateAI);

export default router;
