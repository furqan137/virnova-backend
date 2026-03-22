import { Router } from "express";
import { analyzeTrends } from "../controllers/aiController.js";

const router = Router();

router.post("/analyze", analyzeTrends);

export default router;
