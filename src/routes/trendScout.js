import { Router } from "express";
import {
  generateTrendScoutFeed,
  listTrendScoutIdeas,
  updateTrendScoutIdeaStatus
} from "../controllers/trendScoutController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", generateTrendScoutFeed);
router.post("/generate", generateTrendScoutFeed);
router.get("/ideas", listTrendScoutIdeas);
router.put("/ideas/:id/status", updateTrendScoutIdeaStatus);

export default router;
