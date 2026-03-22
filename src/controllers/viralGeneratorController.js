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
    const { niche, topic, audience, links } = req.body || {};
    if (!niche || !topic || !audience) {
      return res.status(400).json({ error: "niche, topic, and audience are required" });
    }

    const apiKey = getWavespeedApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: "WAVESPEED_API_KEY is missing in backend .env" });
    }

    const normalizedLinks = Array.isArray(links)
      ? links.filter(Boolean).join(", ")
      : String(links || "N/A");

    const prompt = `
Create a viral content package.

Niche: ${niche}
Topic: ${topic}
Audience: ${audience}
Links: ${normalizedLinks}

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
