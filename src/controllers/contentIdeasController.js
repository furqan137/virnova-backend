import axios from "axios";
import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

function safeJsonParseIdeas(rawText) {
  if (!rawText || typeof rawText !== "string") return [];

  try {
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Continue with array extraction fallback.
  }

  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeIdeas(ideas) {
  if (!Array.isArray(ideas)) return [];
  return ideas
    .map((item, index) => ({
      id: `${index}-${String(item?.title || "idea").slice(0, 16)}`,
      title: String(item?.title || "").trim(),
      hook: String(item?.hook || "").trim(),
      description: String(item?.description || item?.short || item?.explanation || "").trim()
    }))
    .filter((item) => item.title && item.hook && item.description);
}

export async function generateContentIdeas(req, res) {
  const { niche } = req.body || {};
  if (!niche || !String(niche).trim()) {
    return res.status(400).json({
      success: false,
      error: "niche is required"
    });
  }

  const apiKey = getWavespeedApiKey();
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "WAVESPEED_API_KEY is missing"
    });
  }

  const prompt = `Generate highly viral short-form video content ideas for the niche: "${String(
    niche
  ).trim()}".

Return EXACTLY in JSON format:

[
{
"title": "Title of video idea",
"hook": "Scroll-stopping hook (max 10 words)",
"description": "Short explanation of the content idea"
}
]

Rules:
- Generate 6 ideas
- Focus on viral, engaging, emotional triggers
- When describing visuals, use cinematic and highly descriptive prompts for AI video tools like Kling.
- Include concrete lighting, camera angle, motion, and emotion cues (avoid generic wording).
- No markdown
- No explanation text
- Only JSON`;

  try {
    console.log("[content-ideas] request", { niche: String(niche).trim() });

    const response = await axios.post(
      `${WAVESPEED_BASE_URL}/chat/completions`,
      {
        model: WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const rawText = response?.data?.choices?.[0]?.message?.content || "";
    const parsedIdeas = safeJsonParseIdeas(rawText);
    const ideas = normalizeIdeas(parsedIdeas);

    if (!ideas.length) {
      return res.status(502).json({
        success: false,
        error: "Invalid JSON response from LLM provider"
      });
    }

    return res.json({ ideas });
  } catch (error) {
    console.error("[content-ideas] error", error?.response?.data || error?.message || error);
    return res.status(error?.response?.status || 500).json({
      success: false,
      error:
        error?.response?.data?.error?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to generate ideas. Try again."
    });
  }
}
