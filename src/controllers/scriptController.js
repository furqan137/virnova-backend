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

function cleanJsonText(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseStrictJson(text) {
  const cleaned = cleanJsonText(text);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return parseFirstJsonObject(cleaned);
  }
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeHookText(hook) {
  return String(hook || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "");
}

function scoreHook(hook) {
  const text = normalizeHookText(hook).toLowerCase();
  const words = wordCount(text);
  let score = 0;

  if (words > 0 && words <= 10) score += 2;
  if (text.includes("nobody is talking about this")) score += 3;
  if (text.includes("this is actually crazy")) score += 3;
  if (text.includes("you won't believe this") || text.includes("you won’t believe this")) score += 3;
  if (/\b(nobody|secret|crazy|truth|exposed|never|wrong)\b/.test(text)) score += 2;
  if (/\b(why|how|what)\b/.test(text)) score += 1;
  return score;
}

function buildHookSet(inputHook, topic, niche, ragebaitMode = false) {
  const cleaned = normalizeHookText(inputHook);
  const safeTopic = String(topic || "this").trim();
  const safeNiche = String(niche || "content").trim();
  const baseHooks = ragebaitMode
    ? [
        `${safeTopic} is better than most strategies`,
        `People are wrong about ${safeTopic}`,
        `This will trigger you about ${safeNiche}`
      ]
    : [
        `Nobody is talking about this ${safeTopic} trick`,
        `This is actually crazy for ${safeNiche} creators`,
        `You won't believe this ${safeTopic} result`
      ];

  const hooks = [cleaned, ...baseHooks]
    .filter(Boolean)
    .map((hook) => normalizeHookText(hook))
    .map((hook) => (wordCount(hook) > 10 ? hook.split(/\s+/).slice(0, 10).join(" ") : hook));

  const uniqueHooks = [...new Set(hooks)].slice(0, 3);
  while (uniqueHooks.length < 3) {
    uniqueHooks.push(baseHooks[uniqueHooks.length]);
  }

  const strongest = [...uniqueHooks].sort((a, b) => scoreHook(b) - scoreHook(a))[0] || "";
  return { hook_variations: uniqueHooks, strongest_hook: strongest };
}

function buildLoopEnding(inputEnding, hook, topic) {
  const cleaned = String(inputEnding || "").replace(/\s+/g, " ").trim();
  const hookSnippet = normalizeHookText(hook).split(/\s+/).slice(0, 4).join(" ");
  if (cleaned && /watch again|rewatch|replay|missed/i.test(cleaned)) {
    if (hookSnippet && !cleaned.toLowerCase().includes(hookSnippet.toLowerCase())) {
      return `${cleaned} Rewatch from "${hookSnippet}" and catch the clue.`;
    }
    return cleaned;
  }
  return `You missed it. Watch again from "${hookSnippet || topic}" and catch the clue.`;
}

function normalizeScriptResult(value, fallbackText = "", ragebaitMode = false, topic = "", niche = "") {
  const baseValue = value && typeof value === "object" ? value : {};
  const hooks = buildHookSet(baseValue.hook, baseValue.topic || topic, baseValue.niche || niche, ragebaitMode);

  const inputScenes = Array.isArray(baseValue.scenes) ? baseValue.scenes : [];
  const normalizedScenes = inputScenes
    .filter((scene) => scene && typeof scene === "object")
    .map((scene, index) => ({
      scene_number: Number(scene.scene_number) || index + 1,
      visual_prompt: String(scene.visual_prompt || ""),
      camera_style: String(scene.camera_style || scene.camera_movement || ""),
      text_overlay: String(scene.text_overlay || "")
    }));

  while (normalizedScenes.length < 3) {
    const sceneIndex = normalizedScenes.length + 1;
    normalizedScenes.push({
      scene_number: sceneIndex,
      visual_prompt:
        sceneIndex === 1
          ? `Close-up hero shot about ${topic}, cinematic lighting, fast cuts, intense emotion.`
          : `Dynamic scene ${sceneIndex} for ${topic}, neon practical lights, tracking shot, high-energy reaction.`,
      camera_style: sceneIndex === 1 ? "Close-up with quick push-in and fast cuts" : "Tracking shot with subtle zoom",
      text_overlay: sceneIndex === 1 ? "Watch this" : `Scene ${sceneIndex}`
    });
  }

  const hashtags = Array.isArray(baseValue.hashtags)
    ? baseValue.hashtags.map((tag) => String(tag)).filter(Boolean)
    : [];

  return {
    hook: hooks.strongest_hook,
    hook_variations: hooks.hook_variations.slice(0, 3),
    voiceover: String(baseValue.voiceover || baseValue.script || fallbackText || ""),
    scenes: normalizedScenes.slice(0, 5),
    loop_ending: buildLoopEnding(baseValue.loop_ending || baseValue.loopEnding, hooks.strongest_hook, topic),
    caption: String(baseValue.caption || ""),
    hashtags
  };
}

export async function generateScriptFromLlm(req, res) {
  const { niche, topic, audience, tone, ragebait_mode, reference_viral_content, platform } = req.body || {};
  const ragebaitMode = ragebait_mode === true || ragebait_mode === "true" || ragebait_mode === 1 || ragebait_mode === "1";
  const referenceViralContent = String(reference_viral_content || "").trim();
  const normalizedPlatform = String(platform || "tiktok").toLowerCase();
  const isInstagram = normalizedPlatform === "instagram_reels" || normalizedPlatform === "instagram";
  const platformLabel = isInstagram ? "Instagram Reels" : "TikTok";
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
Ragebait mode: ${ragebaitMode ? "Enabled" : "Disabled"}
Platform: ${platformLabel}
Reference viral content: ${referenceViralContent || "N/A"}

Return STRICT JSON format:

{
"hook": "",
"hook_variations": ["", "", ""],
"voiceover": "",
"scenes": [
  {
    "scene_number": 1,
    "visual_prompt": "",
    "camera_style": "",
    "text_overlay": ""
  }
],
"loop_ending": "",
"caption": "",
"hashtags": []
}

Rules:
- Create 3 to 5 scenes.
- Generate exactly 3 hook variations under "hook_variations".
- Each hook must be 10 words or fewer.
- Hooks must trigger curiosity, controversy, or shock.
- If ragebait mode is enabled: use controversial opinion/debate/comparison framing such as "X is better than Y", "People are wrong about this", or "This will trigger you...".
- If ragebait mode is disabled: use viral hook styles like "Nobody is talking about this...", "This is actually crazy...", and "You won't believe this...".
- Keep hooks engaging, provocative, and policy-safe: no hate, abuse, or targeted harassment.
- Choose the best-performing option and set it as both "strongest_hook" and "hook".
- If reference viral content is provided, first analyze its structure and then mimic its style, pacing, and tone.
- If no reference viral content is provided, use general viral patterns for short-form content.
- Platform tuning:
  - TikTok: use more aggressive hooks and faster pacing with stronger pattern interrupts.
  - Instagram Reels: use cleaner style, smoother pacing, and more aesthetic visual framing.
- Each scene should be fast-paced and designed for a total reel duration between 6 and 12 seconds.
- Each "visual_prompt" must be a detailed Kling-style prompt for AI video generation.
- Make prompts cinematic and highly descriptive for AI video tools like Kling.
- Every "visual_prompt" must explicitly include:
  - Lighting (cinematic, neon, natural, golden hour, practical light, etc.)
  - Camera angle (close-up, wide shot, overhead, drone, low angle, POV)
  - Motion (fast cuts, zoom, tracking shot, dolly, whip pan, handheld movement)
  - Emotion (excited, shocked, intense, curious, relieved, etc.)
- Avoid generic wording like "a man walking".
- Use specific visual language like: "Close-up of a street food vendor cooking, cinematic lighting, steam rising, fast cuts, vibrant colors".
- "camera_style" should be specific and dynamic (e.g., "quick push-in close-up, fast cuts, handheld micro-shake").
- "text_overlay" should be short and punchy for on-screen captions.
- "voiceover" must read naturally as one complete reel script.
- The final scene must naturally set up replay to improve looping retention.
- "loop_ending" must connect back to the hook, create curiosity, and explicitly encourage rewatch.
- Make the ending feel like it naturally loops into the beginning.
- "hashtags" must be an array of strings.
- Return ONLY pure JSON, with no markdown, no explanations, and no extra text before/after.
`.trim();

  try {
    console.log("[generate-script] request", {
      niche,
      topic,
      audience: audience || "General audience",
      tone: tone || "Engaging",
      ragebaitMode
    });

    const sendPrompt = async (messageContent) => {
      const response = await fetch(`${WAVESPEED_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash",
          messages: [{ role: "user", content: messageContent }]
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
        throw new Error(
          payload?.error?.message ||
            payload?.error ||
            payload?.message ||
            `Wavespeed request failed with status ${response.status}`
        );
      }
      return payload;
    };

    let payload = await sendPrompt(prompt);
    let resultText = payload?.choices?.[0]?.message?.content || "";
    if (!resultText) {
      return res.status(502).json({
        success: false,
        error: "Invalid response from LLM provider"
      });
    }

    let parsed = parseStrictJson(resultText);
    if (!parsed) {
      const retryPrompt = `${prompt}

You failed the JSON requirement. Fix and return ONLY valid JSON matching the schema exactly.
Do not add any text before or after JSON.`;
      payload = await sendPrompt(retryPrompt);
      resultText = payload?.choices?.[0]?.message?.content || "";
      parsed = parseStrictJson(resultText);
    }
    if (!parsed) {
      return res.status(502).json({ success: false, error: "AI did not return valid JSON." });
    }

    const normalized = normalizeScriptResult(parsed, resultText, ragebaitMode, topic, niche);
    console.log("[generate-script] provider response:", payload);
    console.log("[generate-script] success", {
      hasHook: Boolean(normalized.hook),
      sceneCount: normalized.scenes.length,
      hasVoiceover: Boolean(normalized.voiceover),
      hasLoopEnding: Boolean(normalized.loop_ending)
    });

    return res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    console.error("[generate-script] error", error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || "API error"
    });
  }
}
