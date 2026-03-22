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
    // Continue with JSON extraction from mixed text.
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeScriptResult(value, fallbackText = "") {
  if (value && typeof value === "object") {
    return {
      hook: String(value.hook || ""),
      script: String(value.script || ""),
      loopEnding: String(value.loopEnding || "")
    };
  }

  return {
    hook: "",
    script: String(fallbackText || ""),
    loopEnding: ""
  };
}

export async function generateScriptFromLlm(req, res) {
  const { niche, topic, audience, tone } = req.body || {};
  if (!niche || !topic) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields"
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
You are a viral short-form content expert.

Create a high-performing Instagram/TikTok reel script.

Niche: ${niche}
Topic: ${topic}
Audience: ${audience || "General audience"}
Tone: ${tone || "Engaging"}

Return STRICT JSON format:

{
"hook": "",
"script": "",
"loopEnding": ""
}
`.trim();

  try {
    console.log("[generate-script] request", {
      niche,
      topic,
      audience: audience || "General audience",
      tone: tone || "Engaging"
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

    const resultText = payload?.choices?.[0]?.message?.content || "";
    if (!resultText) {
      return res.status(502).json({
        success: false,
        error: "Invalid response from LLM provider"
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      parsed = parseFirstJsonObject(resultText);
    }
    if (!parsed) {
      parsed = {
        hook: resultText,
        script: resultText,
        loopEnding: "Stay tuned!"
      };
    }

    const normalized = normalizeScriptResult(parsed, resultText);
    console.log("[generate-script] provider response:", payload);
    console.log("[generate-script] success", {
      hasHook: Boolean(normalized.hook),
      hasScript: Boolean(normalized.script),
      hasLoopEnding: Boolean(normalized.loopEnding)
    });

    return res.json({
      success: true,
      data: normalized,
      rawText: parsed ? undefined : resultText
    });
  } catch (error) {
    console.error("[generate-script] error", error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || "API error"
    });
  }
}
