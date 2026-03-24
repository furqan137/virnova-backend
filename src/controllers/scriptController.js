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

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function inferReferenceStyle(referenceText = "") {
  const text = String(referenceText || "").toLowerCase();
  if (!text.trim()) {
    return {
      tone: "confident",
      pacing: "fast",
      structure: "POV talking-head with quick pattern interrupt",
      storytelling: "direct personal opinion with lifestyle context"
    };
  }

  const tone = text.match(/\bluxury|premium|high-end|elegant\b/)
    ? "luxury confident"
    : text.match(/\bplayful|fun|chaotic|humor|lol\b/)
    ? "playful confident"
    : "bold confident";

  const pacing = text.match(/\bfast|quick|rapid|snappy|cut\b/) ? "very fast" : "medium-fast";
  const structure = text.match(/\bpov|talking|camera|confession\b/)
    ? "POV talking-head with direct to-camera delivery"
    : "POV lifestyle montage with voice-led commentary";
  const storytelling = text.match(/\bstory|journey|before|after\b/)
    ? "mini transformation story arc"
    : "hot-take opener, bold middle claim, replay-trigger ending";

  return { tone, pacing, structure, storytelling };
}

function validateStructuredPayload(value) {
  if (!value || typeof value !== "object") return { valid: false, missing: ["root"] };
  const missing = [];
  if (isBlank(value.hook)) missing.push("hook");
  if (isBlank(value.voiceover)) missing.push("voiceover");
  if (isBlank(value.loop_ending)) missing.push("loop_ending");
  if (isBlank(value.caption)) missing.push("caption");

  if (!Array.isArray(value.hook_variations) || value.hook_variations.length < 3) {
    missing.push("hook_variations(3)");
  }
  if (!Array.isArray(value.hashtags) || value.hashtags.length < 5 || value.hashtags.length > 8) {
    missing.push("hashtags(5-8)");
  }
  if (!Array.isArray(value.scenes) || value.scenes.length < 2 || value.scenes.length > 4) {
    missing.push("scenes(2-4)");
  } else {
    value.scenes.slice(0, 4).forEach((scene, index) => {
      if (!scene || typeof scene !== "object") {
        missing.push(`scenes[${index}]`);
        return;
      }
      if (isBlank(scene.visual_prompt)) missing.push(`scenes[${index}].visual_prompt`);
      if (isBlank(scene.camera_movement || scene.camera_style)) missing.push(`scenes[${index}].camera_movement`);
      if (isBlank(scene.lighting)) missing.push(`scenes[${index}].lighting`);
      if (isBlank(scene.mood)) missing.push(`scenes[${index}].mood`);
      if (isBlank(scene.subject_action)) missing.push(`scenes[${index}].subject_action`);
      if (isBlank(scene.text_overlay)) missing.push(`scenes[${index}].text_overlay`);
    });
  }

  return { valid: missing.length === 0, missing };
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

function isStrongHook(hook) {
  const text = normalizeHookText(hook);
  const lowered = text.toLowerCase();
  const words = wordCount(text);
  if (!text || words < 6 || words > 12) return false;

  const curiosityOrControversy =
    /\b(nobody|wrong|secret|crazy|truth|exposed|stop|why|don't|doing this)\b/.test(lowered) ||
    lowered.includes("nobody talks about this") ||
    lowered.includes("you are doing this wrong") ||
    lowered.includes("you’re doing this wrong");

  const scrollStoppingPattern =
    lowered.includes("this is why") ||
    lowered.includes("nobody talks about this") ||
    lowered.includes("you are doing this completely wrong") ||
    lowered.includes("you’re doing this completely wrong") ||
    lowered.includes("you are doing this wrong") ||
    lowered.includes("you’re doing this wrong");

  return curiosityOrControversy && scrollStoppingPattern;
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
        `This is why you're not growing in ${safeNiche} right now`,
        `Nobody talks about this ${safeTopic} secret anymore`,
        `You're doing this completely wrong in ${safeNiche} content`
      ];

  const hooks = [cleaned, ...baseHooks]
    .filter(Boolean)
    .map((hook) => normalizeHookText(hook))
    .map((hook) => {
      const words = hook.split(/\s+/).filter(Boolean);
      if (words.length > 12) return words.slice(0, 12).join(" ");
      if (words.length < 6) return `${hook} right now`.trim();
      return hook;
    })
    .filter((hook) => isStrongHook(hook));

  const uniqueHooks = [...new Set(hooks)].slice(0, 3);
  while (uniqueHooks.length < 3) {
    const fallback = normalizeHookText(baseHooks[uniqueHooks.length] || `Nobody talks about this ${safeTopic} secret now`);
    const words = fallback.split(/\s+/).filter(Boolean);
    uniqueHooks.push(words.length > 12 ? words.slice(0, 12).join(" ") : words.length < 6 ? `${fallback} right now` : fallback);
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

function applyVoiceoverTone(voiceover, topic, ragebaitMode) {
  const base = String(voiceover || "").trim() || `${topic} explained fast for creators.`;
  if (ragebaitMode) {
    if (/wrong|debate|controvers|hot take|nobody/i.test(base)) return base;
    return `Hot take: most people are wrong about ${topic}. ${base}`;
  }
  return base;
}

function applyCaptionTone(caption, topic, ragebaitMode) {
  const base = String(caption || "").trim() || `${topic} in 3 quick scenes. Watch till the end.`;
  if (ragebaitMode) {
    if (/agree|disagree|wrong|debate|hot take/i.test(base)) return base;
    return `Everyone is doing this wrong on ${topic}. Agree or disagree?`;
  }
  return base;
}

function normalizeScriptResult(value, fallbackText = "", ragebaitMode = false, topic = "", niche = "") {
  const baseValue = value && typeof value === "object" ? value : {};
  const hooks = buildHookSet(baseValue.hook, baseValue.topic || topic, baseValue.niche || niche, ragebaitMode);

  const inputScenes = Array.isArray(baseValue.scenes) ? baseValue.scenes : [];
  const normalizedScenes = inputScenes
    .filter((scene) => scene && typeof scene === "object")
    .map((scene, index) => ({
      scene_number: Number(scene.scene_number) || index + 1,
      visual_prompt:
        String(scene.visual_prompt || "").trim() ||
        `Cinematic rooftop shot for ${topic}, luxury styling, dramatic composition, rich color grade, intense expression.`,
      camera_movement: String(scene.camera_movement || scene.camera_style || "").trim() || "Slow cinematic zoom with subtle handheld drift",
      lighting: String(scene.lighting || "").trim() || "Golden hour backlight with soft rim lighting",
      mood: String(scene.mood || "").trim() || "Confident and energetic",
      subject_action: String(scene.subject_action || "").trim() || "Creator addresses camera with assertive POV statement",
      text_overlay: String(scene.text_overlay || "").trim() || `Scene ${index + 1}`
    }));

  while (normalizedScenes.length < 2) {
    const sceneIndex = normalizedScenes.length + 1;
    normalizedScenes.push({
      scene_number: sceneIndex,
      visual_prompt:
        sceneIndex === 1
          ? `Close-up influencer POV on rooftop about ${topic}, luxury outfit, sunset glow, cinematic composition, high-detail skin texture, expressive face.`
          : `Dynamic city backdrop scene ${sceneIndex} for ${topic}, neon accents, premium streetwear styling, high-contrast cinematic look.`,
      camera_movement: sceneIndex === 1 ? "Slow-motion cinematic zoom-in with handheld micro-shake" : "Tracking pan with quick punch-in",
      lighting: sceneIndex === 1 ? "Golden hour with dramatic rim light" : "Studio-neon mix with dramatic contrast",
      mood: sceneIndex === 1 ? "Bold and provocative" : "Energetic and intense",
      subject_action: sceneIndex === 1 ? "Creator walks toward camera and delivers a direct hot take" : "Creator gestures emphatically while challenging common advice",
      text_overlay: sceneIndex === 1 ? "Watch this" : `Scene ${sceneIndex}`
    });
  }

  const hashtags = Array.isArray(baseValue.hashtags)
    ? baseValue.hashtags.map((tag) => String(tag)).filter(Boolean)
    : [];
  while (hashtags.length < 5) {
    hashtags.push(`#viral${hashtags.length + 1}`);
  }

  return {
    hook: hooks.strongest_hook,
    hook_variations: hooks.hook_variations.slice(0, 3),
    voiceover: applyVoiceoverTone(baseValue.voiceover || baseValue.script || fallbackText || "", topic, ragebaitMode),
    scenes: normalizedScenes.slice(0, 4),
    loop_ending: buildLoopEnding(baseValue.loop_ending || baseValue.loopEnding, hooks.strongest_hook, topic),
    caption: applyCaptionTone(baseValue.caption, topic, ragebaitMode),
    hashtags: hashtags.slice(0, 8)
  };
}

function mergeScriptParts(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  return {
    ...base,
    hook: !isBlank(patch.hook) ? patch.hook : base.hook,
    hook_variations: Array.isArray(patch.hook_variations) && patch.hook_variations.length ? patch.hook_variations : base.hook_variations,
    voiceover: !isBlank(patch.voiceover) ? patch.voiceover : base.voiceover,
    scenes: Array.isArray(patch.scenes) && patch.scenes.length ? patch.scenes : base.scenes,
    loop_ending: !isBlank(patch.loop_ending) ? patch.loop_ending : base.loop_ending,
    caption: !isBlank(patch.caption) ? patch.caption : base.caption,
    hashtags: Array.isArray(patch.hashtags) && patch.hashtags.length ? patch.hashtags : base.hashtags
  };
}

export async function generateScriptFromLlm(req, res) {
  const { niche, topic, audience, tone, ragebait_mode, reference_viral_content, platform } = req.body || {};
  const ragebaitMode = ragebait_mode === true || ragebait_mode === "true" || ragebait_mode === 1 || ragebait_mode === "1";
  const referenceViralContent = String(reference_viral_content || "").trim();
  const styleProfile = inferReferenceStyle(referenceViralContent);
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
Reference style profile:
- Tone: ${styleProfile.tone}
- Pacing: ${styleProfile.pacing}
- Structure: ${styleProfile.structure}
- Storytelling: ${styleProfile.storytelling}

Return STRICT JSON format:

{
"niche": "",
"hook": "",
"hook_variations": ["", "", ""],
"voiceover": "",
"scenes": [
  {
    "scene_number": 1,
    "visual_prompt": "",
    "camera_style": "",
    "lighting": "",
    "mood": "",
    "subject_action": "",
    "text_overlay": ""
  }
],
"loop_ending": "",
"caption": "",
"hashtags": []
}

Rules:
- Create 2 to 4 scenes.
- All content must align strictly to the selected niche.
- Generate exactly 3 hook variations under "hook_variations".
- Each hook must be 6 to 12 words.
- Hooks must trigger curiosity, controversy, or shock.
- If ragebait mode is enabled:
  - Hook: controversial opinion/debate/comparison framing such as "X is better than Y", "People are wrong about this", or "This will trigger you...".
  - Voiceover: debate-style, emotionally charged, provocative but policy-safe.
  - Caption: emotional reaction bait with clear "agree/disagree" comment CTA.
- If ragebait mode is disabled:
  - Hook: informative viral pattern hooks.
  - Voiceover: normal informative tone.
  - Caption: normal educational/informative CTA tone.
- Keep hooks engaging, provocative, and policy-safe: no hate, abuse, or targeted harassment.
- Choose the best-performing option and set it as both "strongest_hook" and "hook".
- If reference viral content is provided, first analyze its structure and then mimic its style, pacing, and tone.
- If reference viral content is provided:
  - mimic influencer storytelling style and personality
  - maintain POV talking format
  - reflect lifestyle aesthetic and strong creator identity
  - avoid robotic wording
- If no reference viral content is provided, use general viral patterns for short-form content.
- Platform tuning:
  - TikTok: use more aggressive hooks and faster pacing with stronger pattern interrupts.
  - Instagram Reels: use cleaner style, smoother pacing, and more aesthetic visual framing.
  - For Instagram Reels specifically, make content POV/opinion-led with real influencer delivery.
- Instagram-style voice rules:
  - Use confident, bold, slightly provocative influencer tone.
  - Keep language Gen-Z, direct speaking, and high-engagement.
  - Make hooks emotional + controversial while staying policy-safe.
  - Keep the whole reel in short-form 6-10 seconds total.
  - Avoid generic lines; make it feel like a real creator talking to camera.
- Each scene should be fast-paced and designed for a total reel duration between 6 and 10 seconds.
- Each "visual_prompt" must be a detailed Kling-style prompt for AI video generation.
- Each scene must include REAL Kling-ready video prompt details and cannot be empty.
- Make prompts cinematic and highly descriptive for AI video tools like Kling.
- Every "visual_prompt" must explicitly include:
  - Lighting (cinematic, neon, natural, golden hour, practical light, etc.)
  - Camera angle (close-up, wide shot, overhead, drone, low angle, POV)
  - Motion (fast cuts, zoom, tracking shot, dolly, whip pan, handheld movement)
  - Emotion (excited, shocked, intense, curious, relieved, etc.)
- Avoid generic wording like "a man walking".
- Use specific visual language like: "Close-up of a street food vendor cooking, cinematic lighting, steam rising, fast cuts, vibrant colors".
- "camera_style" should include camera movement direction (zoom, pan, handheld, tracking, etc.).
- "lighting" should be explicit (golden hour, studio, dramatic, neon practicals, etc.).
- "mood" should be explicit (confident, luxury, energetic, intense, etc.).
- "subject_action" should describe exactly what the subject is doing on screen.
- "text_overlay" should be short and punchy for on-screen captions.
- "voiceover" must read naturally as one complete reel script.
- The final scene must naturally set up replay to improve looping retention.
- "loop_ending" must connect back to the hook, create curiosity, and explicitly encourage rewatch.
- Make the ending feel like it naturally loops into the beginning.
- "hashtags" must be an array of 5 to 8 relevant strings (mix viral + niche).
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
    console.log("[generate-script] raw response:", resultText);
    if (!resultText) {
      return res.status(502).json({
        success: false,
        error: "Invalid AI response"
      });
    }

    let parsed = parseStrictJson(resultText);
    console.log("[generate-script] parsed json:", parsed);
    let normalized = parsed ? normalizeScriptResult(parsed, resultText, ragebaitMode, topic, niche) : null;
    let validation = validateStructuredPayload(normalized);
    console.log("[generate-script] missing fields:", validation?.missing || []);

    for (let attempt = 0; attempt < 2 && (!parsed || !validation.valid); attempt += 1) {
      const retryPrompt = `${prompt}

Your last response failed validation.
Missing/invalid fields: ${(validation?.missing || ["invalid_json"]).join(", ")}.
Regenerate and return ONLY pure JSON with complete fields.`;
      payload = await sendPrompt(retryPrompt);
      resultText = payload?.choices?.[0]?.message?.content || "";
      console.log(`[generate-script] retry ${attempt + 1} raw response:`, resultText);
      parsed = parseStrictJson(resultText);
      console.log(`[generate-script] retry ${attempt + 1} parsed json:`, parsed);
      normalized = parsed ? normalizeScriptResult(parsed, resultText, ragebaitMode, topic, niche) : null;
      validation = validateStructuredPayload(normalized);
      console.log(`[generate-script] retry ${attempt + 1} missing fields:`, validation?.missing || []);
    }

    if (parsed && normalized && !validation.valid) {
      const repairPrompt = `Regenerate ONLY missing parts for this JSON and return ONLY JSON with those fields:
Missing: ${validation.missing.join(", ")}
Current JSON:
${JSON.stringify(normalized)}
`;
      const repairPayload = await sendPrompt(repairPrompt);
      const repairText = repairPayload?.choices?.[0]?.message?.content || "";
      console.log("[generate-script] repair raw response:", repairText);
      const repairParsed = parseStrictJson(repairText);
      console.log("[generate-script] repair parsed json:", repairParsed);
      if (repairParsed && typeof repairParsed === "object") {
        normalized = normalizeScriptResult(
          mergeScriptParts(normalized, repairParsed),
          resultText,
          ragebaitMode,
          topic,
          niche
        );
        validation = validateStructuredPayload(normalized);
        console.log("[generate-script] post-repair missing fields:", validation?.missing || []);
      }
    }

    if (!parsed || !validation.valid) {
      return res.status(502).json({
        success: false,
        error: "Invalid AI response",
        missing: validation?.missing || ["invalid_json"]
      });
    }

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
