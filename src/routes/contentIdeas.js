import { Router } from "express";
import { generateContentIdeas } from "../controllers/contentIdeasController.js";

const router = Router();

router.post("/content-ideas", generateContentIdeas);

export default router;
