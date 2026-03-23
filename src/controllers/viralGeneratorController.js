import axios from "axios";
import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toObjectFromRaw(raw) {
  if (!raw || typeof raw !== "string") return null;
  const clean = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export const generateViral = async (req, res) => {
  try {
    const { niche, topic, audience, links, reference_viral_content, platform } = req.body || {};
    if (!niche || !topic) {
      return res.status(400).json({ error: "niche and topic are required" });
    }

    const apiKey = getWavespeedApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: "WAVESPEED_API_KEY is missing in backend .env" });
    }

    const normalizedReference = String(reference_viral_content || "").trim();
    const normalizedPlatform = String(platform || "tiktok").toLowerCase();
    const isInstagram = normalizedPlatform === "instagram_reels" || normalizedPlatform === "instagram";
    const platformLabel = isInstagram ? "Instagram Reels" : "TikTok";
    const normalizedLinks = Array.isArray(links)
      ? links.filter(Boolean).join(", ")
      : String(links || "N/A");

    const prompt = `
Create a viral content package.

Niche: ${niche}
Topic: ${topic}
Audience: ${String(audience || "General audience")}
Platform: ${platformLabel}
Reference viral content: ${normalizedReference || normalizedLinks || "N/A"}

Instructions:
- If reference viral content is provided, analyze its structure and mimic its style, pacing, and tone.
- If reference viral content is not provided, use general viral patterns.
- Write cinematic, highly descriptive visual language for AI video tools like Kling.
- Include explicit lighting, camera angle, motion, and emotion cues.
- Avoid generic prompts like "a man walking"; prefer specific scene detail.
- Platform tuning:
  - TikTok: more aggressive hooks and faster pacing.
  - Instagram Reels: cleaner style and more aesthetic visuals.

Return JSON:
{
"hook": "...",
"script": "...",
"caption": "...",
"hashtags": ["#tag1"],
"pattern_analysis": "...",
"content_ideas": ["idea1"],
"best_posting_time": "..."
}
`.trim();

    const response = await axios.post(
      `${WAVESPEED_BASE_URL}/chat/completions`,
      {
        model: WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Debug provider payload for runtime diagnostics.
    console.log("[viral-generator] provider response:", response.data);

    const raw = response?.data?.choices?.[0]?.message?.content || "";
    const parsed = toObjectFromRaw(raw);

    if (!parsed || typeof parsed !== "object") {
      console.error("JSON PARSE ERROR:", raw);
      return res.json({ raw });
    }

    const data = {
      hook: String(parsed.hook || ""),
      script: String(parsed.script || ""),
      caption: String(parsed.caption || ""),
      hashtags: asArray(parsed.hashtags),
      pattern_analysis: parsed.pattern_analysis || "",
      content_ideas: asArray(parsed.content_ideas),
      best_posting_time: String(parsed.best_posting_time || "")
    };

    return res.json(data);
  } catch (error) {
    console.error("FULL ERROR:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Backend failed",
      details: error.message
    });
  }
};
