import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

function parseFirstJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to extraction from mixed response content.
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeHashtags(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[\n,]/)
    : [];

  return list
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag))
    .slice(0, 6);
}

function slugTag(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

function buildHashtagSet(description, incoming = []) {
  const words = String(description || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const top = words.slice(0, 2);
  const nicheBase = slugTag(top[0] || "content");
  const topicBase = slugTag(top[1] || "creator");

  const fallback = [
    `#${nicheBase}`,
    `#${topicBase}`,
    `#${nicheBase}tips`,
    "#contentstrategy",
    "#socialmediatips",
    "#viral"
  ];

  const normalizedIncoming = normalizeHashtags(incoming)
    .map((tag) => slugTag(tag))
    .filter(Boolean)
    .map((tag) => `#${tag}`);

  return [...new Set([...normalizedIncoming, ...fallback])].slice(0, 6);
}

function normalizeCaptionText(value, description) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) return cleaned.slice(0, 140);
  const context = String(description || "this").split(/\s+/).slice(0, 4).join(" ");
  return `This take on ${context} is wild. Agree or disagree?`;
}

function normalizeCaptionResult(parsed, rawText = "") {
  if (parsed && typeof parsed === "object") {
    return {
      hook: String(parsed.hook || ""),
      caption: String(parsed.caption || ""),
      hashtags: normalizeHashtags(parsed.hashtags)
    };
  }

  return {
    hook: String(rawText || ""),
    caption: String(rawText || ""),
    hashtags: []
  };
}

export async function generateCaption(req, res) {
  const { description } = req.body || {};
  if (!description || !String(description).trim()) {
    return res.status(400).json({
      success: false,
      error: "description is required"
    });
  }

  const apiKey = getWavespeedApiKey();
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "WAVESPEED_API_KEY is missing"
    });
  }

  const prompt = `
You are a viral social media expert.

Based on the following content description, generate:

1. A powerful viral hook (1 line)
2. A high-engagement caption (2-3 lines)
3. Exactly 6 hashtags as an array:
   - 3 niche-specific
   - 2 medium-competition
   - 1 broad trending

Description:
${description}

If you include visual context in hook/caption wording, make it cinematic and specific for AI video tools like Kling:
- mention lighting (cinematic, neon, natural)
- mention camera angle (close-up, wide, drone)
- mention motion (fast cuts, zoom, tracking shot)
- mention emotion (excited, shocked, intense)
- avoid generic visual phrasing.

Return STRICT JSON:

{
"hook": "",
"caption": "",
"hashtags": []
}
`.trim();

  try {
    console.log("[generate-caption] request", {
      descriptionLength: String(description).trim().length
    });

    const response = await fetch(`${WAVESPEED_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          payload?.error?.message ||
          payload?.error ||
          payload?.message ||
          `Wavespeed request failed with status ${response.status}`
      });
    }

    const rawText = payload?.choices?.[0]?.message?.content || "";
    if (!rawText) {
      return res.status(502).json({
        success: false,
        error: "Invalid response from LLM provider"
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = parseFirstJsonObject(rawText);
    }

    if (!parsed) {
      parsed = {
        hook: rawText,
        caption: rawText,
        hashtags: []
      };
    }

    const normalized = normalizeCaptionResult(parsed, rawText);
    const caption = normalizeCaptionText(normalized.caption, description);
    const hashtags = buildHashtagSet(description, normalized.hashtags);
    console.log("[generate-caption] success", {
      hasHook: Boolean(normalized.hook),
      hasCaption: Boolean(caption),
      hashtagsCount: hashtags.length
    });

    return res.json({
      success: true,
      data: {
        ...normalized,
        caption,
        hashtags
      }
    });
  } catch (error) {
    console.error("[generate-caption] error", error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Server error"
    });
  }
}
