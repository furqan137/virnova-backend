import axios from "axios";
import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";
import { CLIENT_NICHE_HIDDEN_CONTEXT } from "../services/clientNiche.js";

function parseJsonFromText(content) {
  if (!content || typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    // Continue with extraction fallback.
  }
  const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function listFromUnknown(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

async function askWavespeed(prompt) {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) throw new Error("WAVESPEED_API_KEY is missing");

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

  return response?.data?.choices?.[0]?.message?.content || "";
}

function parseInput(req) {
  const { niche, topic, links, audience, reference_viral_content, platform } = req.body || {};
  return {
    niche: String(niche || "").trim(),
    topic: String(topic || "").trim(),
    audience: String(audience || "").trim(),
    reference_viral_content: String(reference_viral_content || "").trim(),
    platform: String(platform || "tiktok").trim().toLowerCase(),
    links: Array.isArray(links)
      ? links.map((item) => String(item || "").trim()).filter(Boolean)
      : String(links || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
  };
}

export async function analyzeViralContent(req, res) {
  const input = parseInput(req);
  if (!input.niche || !input.topic) {
    return res.status(400).json({
      success: false,
      error: "niche and topic are required"
    });
  }

  const isInstagram = input.platform === "instagram_reels" || input.platform === "instagram";
  const platformLabel = isInstagram ? "Instagram Reels" : "TikTok";

  const prompt = `You are a viral strategist.

${CLIENT_NICHE_HIDDEN_CONTEXT}

Analyze creator input and return ONLY valid JSON:
{
  "patterns": ["", "", ""],
  "ideas": ["", "", ""],
  "timing": ["", "", ""]
}

Niche: ${input.niche}
Topic: ${input.topic}
Target audience: ${input.audience || "General audience"}
Platform: ${platformLabel}
Reference viral content: ${input.reference_viral_content || (input.links.length ? input.links.join(", ") : "N/A")}

Reference guidance:
- If reference viral content is provided, analyze structure and mimic style, pacing, and tone.
- If no reference is provided, use general viral patterns.
- Use cinematic, highly descriptive short-form framing suitable for AI video tools like Kling.
- Include explicit lighting, camera angle, motion, and emotion cues in style guidance.
- Avoid generic visuals and prefer vivid, specific scene language.
- Platform tuning:
  - TikTok: aggressive hooks, faster pacing.
  - Instagram Reels: cleaner style, more aesthetic visuals.

Rules:
- Keep everything niche-specific (culture/identity + controversial relationships).
- Keep items concise and actionable
- No markdown
- No text outside JSON`;

  try {
    const raw = await askWavespeed(prompt);
    const parsed = parseJsonFromText(raw) || {};
    const data = {
      patterns: listFromUnknown(parsed?.patterns, [
        "Hook-heavy opening structure",
        "Fast pattern interrupts in first 2 seconds",
        "Direct CTA at ending"
      ]).slice(0, 3),
      ideas: listFromUnknown(parsed?.ideas, [
        "Myth vs reality short",
        "3-step transformation reel",
        "Before/after audience story"
      ]).slice(0, 3),
      timing: listFromUnknown(parsed?.timing, [
        "Tue/Thu/Sat perform best",
        "Post between 7 PM-9 PM local",
        "Repost top clips after 24 hours"
      ]).slice(0, 3)
    };
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.response?.status || 500).json({
      success: false,
      error:
        error?.response?.data?.error?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Analyze failed"
    });
  }
}

export async function generateViralContent(req, res) {
  const input = parseInput(req);
  if (!input.niche || !input.topic) {
    return res.status(400).json({
      success: false,
      error: "niche and topic are required"
    });
  }

  const isInstagram = input.platform === "instagram_reels" || input.platform === "instagram";
  const platformLabel = isInstagram ? "Instagram Reels" : "TikTok";

  const prompt = `You are an elite short-form viral content creator.

${CLIENT_NICHE_HIDDEN_CONTEXT}

Generate a full viral package and return ONLY valid JSON:
{
  "hook": "",
  "script": "",
  "caption": "",
  "hashtags": ["", "", "", "", ""],
  "analysis": {
    "patterns": ["", "", ""],
    "ideas": ["", "", ""],
    "timing": ["", "", ""]
  }
}

Niche: ${input.niche}
Topic: ${input.topic}
Target audience: ${input.audience || "General audience"}
Platform: ${platformLabel}
Reference viral content: ${input.reference_viral_content || (input.links.length ? input.links.join(", ") : "N/A")}

Reference guidance:
- If reference viral content is provided, analyze structure and mimic style, pacing, and tone.
- If no reference is provided, use general viral patterns.
- Script direction should be cinematic and descriptive for AI video tools like Kling.
- Include lighting, camera angle, motion, and emotional beats.
- Avoid generic visual wording; use specific scenes and actions.
- Platform tuning:
  - TikTok: aggressive hooks, faster pacing.
  - Instagram Reels: cleaner style, more aesthetic visuals.

Rules:
- Hook must be scroll-stopping
- Script must be short and practical
- Caption must drive saves/comments
- Use 8-12 hashtags
- No markdown
- No text outside JSON`;

  try {
    const raw = await askWavespeed(prompt);
    const parsed = parseJsonFromText(raw) || {};
    const analysis = parsed?.analysis || {};

    const data = {
      hook: String(parsed?.hook || ""),
      script: String(parsed?.script || ""),
      caption: String(parsed?.caption || ""),
      hashtags: listFromUnknown(parsed?.hashtags, [
        "#viral",
        "#reels",
        "#contentcreator",
        "#socialgrowth",
        "#contentstrategy"
      ]),
      analysis: {
        patterns: listFromUnknown(analysis?.patterns, []).slice(0, 3),
        ideas: listFromUnknown(analysis?.ideas, []).slice(0, 3),
        timing: listFromUnknown(analysis?.timing, []).slice(0, 3)
      }
    };

    if (!data.hook && !data.script && !data.caption) {
      return res.status(502).json({
        success: false,
        error: "Invalid AI response"
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error?.response?.status || 500).json({
      success: false,
      error:
        error?.response?.data?.error?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Generation failed"
    });
  }
}
