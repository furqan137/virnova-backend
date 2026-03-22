import { Router } from "express";
import { generateCaption } from "../controllers/captionController.js";

const router = Router();

router.post("/generate-caption", generateCaption);

export default router;
