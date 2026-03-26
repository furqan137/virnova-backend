import { generateStrictJson, MASTER_SYSTEM_PROMPT } from "../services/llmClient.js";
import { CLIENT_NICHE_HIDDEN_CONTEXT } from "../services/clientNiche.js";

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function validatePayload(value) {
  if (!value || typeof value !== "object") return { valid: false, missing: ["root"] };
  const missing = [];
  if (isBlank(value.hook)) missing.push("hook");
  if (isBlank(value.script)) missing.push("script");
  if (isBlank(value.loop_ending)) missing.push("loop_ending");
  if (isBlank(value.caption)) missing.push("caption");
  if (!Array.isArray(value.hashtags) || value.hashtags.length < 5) missing.push("hashtags(>=5)");
  if (!Array.isArray(value.scenes) || value.scenes.length < 2) missing.push("scenes(>=2)");
  return { valid: missing.length === 0, missing };
}

function normalizeResult(value, trend) {
  const base = value && typeof value === "object" ? value : {};
  const hook = String(base.hook || trend?.hook || "").trim() || "POV: he said 50/50, so I laughed";
  const script = String(base.script || "").trim() || String(trend?.adaptation_for_user || "").trim() || hook;
  const caption = String(base.caption || "").trim() || "some of you still don’t get it 😅";
  const loop_ending =
    String(base.loop_ending || "").trim() || `Watch again from "${hook.split(/\\s+/).slice(0, 4).join(" ")}"`;

  const hashtags = Array.isArray(base.hashtags) ? base.hashtags.map((t) => String(t || "").trim()).filter(Boolean) : [];
  const uniq = [...new Set(hashtags)];
  while (uniq.length < 5) uniq.push(`#reels${uniq.length + 1}`);

  const scenesIn = Array.isArray(base.scenes) ? base.scenes : [];
  const scenes = scenesIn
    .filter((s) => s && typeof s === "object")
    .map((s, idx) => ({
      scene: Number(s.scene) || idx + 1,
      visual: String(s.visual || "").trim() || "Front cam selfie in car, luxury vibe, natural light, slight handheld.",
      voiceover: String(s.voiceover || "").trim() || "",
      text_overlay: String(s.text_overlay || "").trim() || hook,
      camera: String(s.camera || "").trim() || "Front camera selfie, slight handheld movement"
    }));

  const lines = script.split("\n").map((l) => l.trim()).filter(Boolean);
  while (scenes.length < 3) {
    scenes.push({
      scene: scenes.length + 1,
      visual: scenes.length === 0 ? "Mirror selfie in elevator, clean outfit, soft lighting, smirk." : "Kitchen vlog shot, warm light, coffee cup, confident look.",
      voiceover: "",
      text_overlay: scenes.length === 0 ? hook : "Be honest… who’s wrong?",
      camera: scenes.length === 0 ? "Mirror selfie" : "Casual vlog, handheld"
    });
  }

  return {
    hook,
    script,
    scenes: scenes.slice(0, 4).map((s, idx) => ({ ...s, voiceover: s.voiceover || lines[idx] || lines[0] || script })),
    caption,
    hashtags: uniq.slice(0, 8),
    loop_ending
  };
}

export async function generateScriptFromTrend(req, res) {
  const trend = req.body?.trend;
  if (!trend || typeof trend !== "object") {
    return res.status(400).json({ success: false, error: "trend object is required" });
  }

  // eslint-disable-next-line no-console
  console.log("[generate-script-from-trend] TREND SENT:", trend);

  const prompt = `
You are a viral content strategist.
Convert trend ideas into HIGH-CONVERTING short-form video scripts.
Focus on hooks, emotional tension, retention, and viral structure.

${CLIENT_NICHE_HIDDEN_CONTEXT}

Convert the following trend into a complete viral video script.

TREND DATA:
- Hook: ${String(trend?.hook || "")}
- Type: ${String(trend?.content_type || "")}
- Summary: ${String(trend?.summary || "")}
- Why it works: ${JSON.stringify(trend?.why_it_works || {})}
- Adaptation: ${String(trend?.adaptation_for_user || "")}

OUTPUT FORMAT (STRICT JSON):
{
  "hook": "",
  "script": "",
  "scenes": [
    {
      "scene": 1,
      "visual": "",
      "voiceover": "",
      "text_overlay": "",
      "camera": ""
    }
  ],
  "caption": "",
  "hashtags": [],
  "loop_ending": ""
}

RULES:
- Hook must be STRONG and scroll-stopping
- Script must feel like Instagram Reels / TikTok
- No empty fields
- Output ONLY JSON (no text outside)
`.trim();

  try {
    const { parsed, raw } = await generateStrictJson({
      systemPrompt: MASTER_SYSTEM_PROMPT,
      userPrompt: prompt,
      model: "openai/gpt-5.4-pro",
      temperature: 0.7,
      max_tokens: 2200,
      retries: 1,
      validate: (obj) => validatePayload(obj).valid
    });

    // eslint-disable-next-line no-console
    console.log("[generate-script-from-trend] LLM RESPONSE:", raw);

    const normalized = normalizeResult(parsed, trend);
    const validation = validatePayload(normalized);
    if (!validation.valid) {
      const fallback = normalizeResult(
        {
          hook: String(trend?.hook || ""),
          script: `${String(trend?.hook || "")}\nStandards aren’t “toxic”. They’re expensive.\nBe honest—who’s wrong?`,
          scenes: [],
          caption: "this is why I don’t argue anymore",
          hashtags: ["#relationships", "#dating", "#arabgirl", "#moroccan", "#reels", "#fyp"],
          loop_ending: "Watch again from the first word."
        },
        trend
      );
      return res.json({ success: true, data: fallback, fallback: true });
    }

    return res.json({ success: true, data: normalized });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[generate-script-from-trend] error:", error?.message || error);
    const fallback = normalizeResult(
      {
        hook: String(trend?.hook || ""),
        script: `${String(trend?.hook || "")}\nStandards aren’t “toxic”. They’re expensive.\nBe honest—who’s wrong?`,
        scenes: [],
        caption: "this is why I don’t argue anymore",
        hashtags: ["#relationships", "#dating", "#arabgirl", "#moroccan", "#reels", "#fyp"],
        loop_ending: "Watch again from the first word."
      },
      trend
    );
    return res.json({ success: true, data: fallback, fallback: true });
  }
}

