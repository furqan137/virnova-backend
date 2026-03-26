import { Router } from "express";
import { WAVESPEED_BASE_URL, WAVESPEED_FALLBACK_MODEL, WAVESPEED_MODEL } from "../config/wavespeed.js";
import { chatCompletion } from "../services/llmClient.js";

const router = Router();

router.get("/health/llm", async (_req, res) => {
  const hasKey = Boolean(process.env.WAVESPEED_API_KEY);
  if (!hasKey) {
    return res.status(500).json({
      ok: false,
      service: "llm",
      error: "Missing WAVESPEED_API_KEY",
      base_url: WAVESPEED_BASE_URL,
      model: WAVESPEED_MODEL,
      fallback_model: WAVESPEED_FALLBACK_MODEL
    });
  }

  const started = Date.now();
  try {
    const completion = await chatCompletion({
      model: WAVESPEED_MODEL,
      temperature: 0,
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with: ok" }]
    });
    const content = completion?.choices?.[0]?.message?.content || "";
    return res.json({
      ok: true,
      service: "llm",
      base_url: WAVESPEED_BASE_URL,
      model: WAVESPEED_MODEL,
      fallback_model: WAVESPEED_FALLBACK_MODEL,
      latency_ms: Date.now() - started,
      sample: String(content).trim().slice(0, 40)
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      service: "llm",
      base_url: WAVESPEED_BASE_URL,
      model: WAVESPEED_MODEL,
      fallback_model: WAVESPEED_FALLBACK_MODEL,
      latency_ms: Date.now() - started,
      error: String(error?.message || error || "LLM request failed")
    });
  }
});

export default router;

