import {
  getWavespeedApiKey,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";
import { MASTER_SYSTEM_PROMPT, chatCompletion } from "../services/llmClient.js";

class WavespeedHttpError extends Error {
  constructor(message, statusCode, payload) {
    super(message);
    this.name = "WavespeedHttpError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function isProductUnavailableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("product not found") || message.includes("not found");
}

function extractText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.output === "string") return payload.output;
  if (typeof payload.result === "string") return payload.result;
  if (typeof payload.message === "string") return payload.message;

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (firstChoice?.message?.content) return String(firstChoice.message.content);
  if (typeof firstChoice?.text === "string") return firstChoice.text;

  if (Array.isArray(payload.data) && typeof payload.data[0] === "string") return payload.data[0];
  return "";
}

function tryParseJsonFromText(text) {
  if (!text || typeof text !== "string") return null;

  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch (_error) {
    // Continue to bracket extraction fallback.
  }

  const jsonMatch = direct.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (_error) {
    return null;
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

function slugTag(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

function normalizeCaption(caption, topic) {
  const cleaned = String(caption || "")
    .replace(/\s+/g, " ")
    .trim();
  const withCta = cleaned || `Be honest... are you doing this with ${topic}?`;
  if (/\b(save|comment|agree|disagree|watch|share)\b/i.test(withCta)) {
    return withCta.slice(0, 140);
  }
  return `${withCta.slice(0, 110)} Comment yes or no.`.trim();
}

function buildHashtagSet(topic, niche, incoming = []) {
  const nicheTag = slugTag(niche) || "contentcreator";
  const topicTag = slugTag(topic) || "growth";
  const fallback = [
    `#${nicheTag}`,
    `#${topicTag}`,
    `#${nicheTag}tips`,
    "#contentstrategy",
    "#socialmediatips",
    "#viralreels",
    "#trendingnow",
    "#creatorlife"
  ];

  const normalizedIncoming = Array.isArray(incoming)
    ? incoming
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${slugTag(tag)}`))
        .filter((tag) => tag.length > 1)
    : [];

  const combined = [...normalizedIncoming, ...fallback];
  const unique = [...new Set(combined)];
  return unique.slice(0, 8);
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
  const base = String(voiceover || "").trim() || `${topic} breakdown in 3 fast scenes.`;
  if (ragebaitMode) {
    if (/wrong|debate|controvers|hot take|nobody/i.test(base)) return base;
    return `Hot take: most people are wrong about ${topic}. ${base}`;
  }
  return base;
}

function applyCaptionTone(caption, topic, ragebaitMode) {
  const base = String(caption || "").trim() || `${topic} explained in 3 scenes. Rewatch for details.`;
  if (ragebaitMode) {
    if (/agree|disagree|wrong|debate|hot take/i.test(base)) return base;
    return `Everyone is doing this wrong on ${topic}. Agree or disagree?`;
  }
  return base;
}

function cleanJsonText(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeScriptJsonShape(value, topic, niche, ragebaitMode) {
  const payload = value && typeof value === "object" ? value : {};
  const hooks = buildHookSet(payload.hook || payload.strongest_hook, topic, niche, ragebaitMode);
  const hookVariations = hooks.hook_variations.slice(0, 3);
  while (hookVariations.length < 3) {
    hookVariations.push(`Variation ${hookVariations.length + 1}`);
  }

  const scenes = (Array.isArray(payload.scenes) ? payload.scenes : [])
    .filter((scene) => scene && typeof scene === "object")
    .map((scene, index) => ({
      scene_number: Number(scene.scene_number) || index + 1,
      visual_prompt:
        String(scene.visual_prompt || "").trim() ||
        `Cinematic influencer shot for ${topic}, premium styling, dramatic framing, vivid color contrast.`,
      camera_movement: String(scene.camera_movement || scene.camera_style || "").trim() || "Cinematic zoom-in with slight handheld motion",
      lighting: String(scene.lighting || "").trim() || "Golden hour with dramatic edge lighting",
      mood: String(scene.mood || "").trim() || "Confident and provocative",
      subject_action: String(scene.subject_action || "").trim() || "Creator delivers a direct POV statement to camera",
      text_overlay: String(scene.text_overlay || "").trim() || `Scene ${index + 1}`
    }));

  while (scenes.length < 2) {
    scenes.push({
      scene_number: scenes.length + 1,
      visual_prompt: `Scene ${scenes.length + 1} for ${topic}, cinematic lighting, dynamic motion, intense emotion.`,
      camera_movement: "Close-up with fast push-in",
      lighting: "Studio dramatic key light",
      mood: "Energetic and intense",
      subject_action: "Creator reacts and emphasizes key point with hand gestures",
      text_overlay: `Scene ${scenes.length + 1}`
    });
  }

  const hashtags = (Array.isArray(payload.hashtags) ? payload.hashtags : []).map((tag) => String(tag)).filter(Boolean);
  while (hashtags.length < 5) {
    hashtags.push(`#viral${hashtags.length + 1}`);
  }

  return {
    hook: hooks.strongest_hook,
    hook_variations: hookVariations,
    voiceover: applyVoiceoverTone(payload.voiceover || payload.script || "", topic, ragebaitMode),
    scenes: scenes.slice(0, 4),
    loop_ending: buildLoopEnding(payload.loop_ending || payload.loopEnding, hooks.strongest_hook, topic),
    caption: applyCaptionTone(payload.caption || "", topic, ragebaitMode),
    hashtags: hashtags.slice(0, 8)
  };
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
  if (!Array.isArray(value.hook_variations) || value.hook_variations.length < 3) missing.push("hook_variations(3)");
  if (!Array.isArray(value.hashtags) || value.hashtags.length < 5 || value.hashtags.length > 8) missing.push("hashtags(5-8)");
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

async function callWavespeed(prompt, options = {}) {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) {
    throw new Error("WAVESPEED_API_KEY is missing in .env");
  }

  const {
    temperature = 0.7,
    max_tokens = 2000,
    model = WAVESPEED_MODEL,
    systemPrompt = MASTER_SYSTEM_PROMPT
  } = options || {};

  try {
    const completion = await chatCompletion({
      model,
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: String(prompt || "") }
      ]
    });
    const text = completion?.choices?.[0]?.message?.content || "";
    return { data: completion, text };
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    const message = error?.message || "Wavespeed LLM request failed";
    throw new WavespeedHttpError(message, status, null);
  }
}

function jsonInstruction(schemaDescription) {
  return `Return ONLY valid JSON. Do not include markdown. Schema: ${schemaDescription}`;
}

function sendAiError(res, error) {
  if (error instanceof WavespeedHttpError) {
    return res.status(error.statusCode).json({
      error: error.message,
      statusCode: error.statusCode,
      provider: "wavespeed"
    });
  }

  const message = error?.message || "API error";
  return res.status(500).json({ error: message, statusCode: 500 });
}

export const generateAI = async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const { data, text } = await callWavespeed(prompt, { max_tokens: 1200, temperature: 0.7 });
    const parsed = tryParseJsonFromText(text);
    return res.json({ text, parsed, raw: data });
  } catch (error) {
    if (isProductUnavailableError(error)) {
      return res.json({
        text: "Wavespeed product unavailable. Using fallback AI response.",
        parsed: {
          note: "Fallback response generated by Virnova backend.",
          promptPreview: String(prompt).slice(0, 240)
        },
        fallback: true,
        warning: "Wavespeed product unavailable; using local fallback."
      });
    }
    return sendAiError(res, error);
  }
};

export const generateScript = async (req, res) => {
  const { niche, topic, audience, ragebait_mode, reference_viral_content, platform } = req.body || {};
  const ragebaitMode = ragebait_mode === true || ragebait_mode === "true" || ragebait_mode === 1 || ragebait_mode === "1";
  const referenceViralContent = String(reference_viral_content || "").trim();
  const styleProfile = inferReferenceStyle(referenceViralContent);
  const normalizedPlatform = String(platform || "tiktok").toLowerCase();
  const isInstagram = normalizedPlatform === "instagram_reels" || normalizedPlatform === "instagram";
  const platformLabel = isInstagram ? "Instagram Reels" : "TikTok";
  if (!niche || !topic) {
    return res.status(400).json({ error: "niche and topic are required" });
  }

  const prompt = `Generate a viral Instagram Reel script.

Niche: ${niche}
Topic: ${topic}
Audience: ${String(audience || "General audience")}
Ragebait mode: ${ragebaitMode ? "Enabled" : "Disabled"}
Platform: ${platformLabel}
Reference viral content: ${referenceViralContent || "N/A"}
Reference style profile:
- Tone: ${styleProfile.tone}
- Pacing: ${styleProfile.pacing}
- Structure: ${styleProfile.structure}
- Storytelling: ${styleProfile.storytelling}

Return structured scene-by-scene output for a high-retention short-form reel.
Use 2 to 4 scenes total, optimized for a 6-10 second reel.
Each scene must include:
- scene_number
- visual_prompt (cinematic Kling-style prompt ready for AI video tools)
- camera_style
- lighting
- mood
- subject_action
- text_overlay

Also include:
- hook
- hook_variations (exactly 3)
- voiceover
- loop_ending
- caption
- hashtags (5 to 8)

Hook mode rules:
- If ragebait mode is enabled:
  - Hook: controversial opinion-based hooks using debate/comparison framing.
  - Voiceover: debate-style tone that triggers emotional reaction.
  - Caption: emotional, provocative CTA that drives comments.
- If ragebait mode is disabled:
  - Hook: informative viral patterns.
  - Voiceover: normal informative tone.
  - Caption: normal informative tone.
- Keep all hooks policy-safe and non-offensive (no hate, abuse, or targeted harassment).
- "loop_ending" must connect back to the hook, create curiosity, and encourage rewatch.
- Make the ending naturally loop into the beginning.
- If reference viral content is provided, analyze it and mimic its structure, pacing, and tone.
- If reference viral content is provided:
  - copy storytelling style and creator personality cues
  - use POV talking delivery
  - keep lifestyle aesthetic framing
  - avoid generic AI phrasing
- If reference viral content is not provided, rely on general viral content patterns.
- All content must remain strictly niche-specific and avoid generic filler.
- Platform tuning:
  - TikTok: more aggressive hooks, faster pacing, stronger pattern interrupts.
  - Instagram Reels: cleaner style, slightly smoother pacing, more aesthetic visual composition.
  - For Instagram Reels specifically, make content POV/opinion-led with authentic influencer delivery.
- Instagram-style tone rules:
  - Use confident, bold, slightly provocative influencer tone.
  - Use Gen-Z phrasing with direct speaking and high engagement energy.
  - Hooks should be emotional + controversial (policy-safe).
  - Keep script structure optimized for 6-10 second short-form reels.
  - Avoid generic content and make it feel like real influencer commentary.
- All scene "visual_prompt" outputs must be cinematic and Kling-ready, explicitly including:
  - lighting style (cinematic, neon, natural, practical, etc.)
  - camera angle (close-up, wide, low-angle, overhead, drone, POV)
  - motion (fast cuts, zoom, tracking shot, dolly, whip pan, handheld)
  - visible emotion (excited, shocked, intense, curious, etc.)
- Avoid generic prompts like "a man walking"; use specific, vivid scene descriptions.
- Do NOT leave scenes empty. Each scene must include camera_style, lighting, mood, and subject_action.

Make it fast-paced, highly engaging, and designed for looping retention.
${jsonInstruction(
    '{"niche":"string","hook":"string","hook_variations":["string","string","string"],"voiceover":"string","scenes":[{"scene_number":1,"visual_prompt":"string","camera_style":"string","lighting":"string","mood":"string","text_overlay":"string"},{"scene_number":2,"visual_prompt":"string","camera_style":"string","lighting":"string","mood":"string","text_overlay":"string"}],"loop_ending":"string","caption":"string","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}'
  )}`;

  try {
    const { text } = await callWavespeed(prompt, { max_tokens: 2000, temperature: 0.7 });
    console.log("[generateScript] raw response:", text);
    let parsed = null;
    try {
      parsed = JSON.parse(cleanJsonText(text));
    } catch {
      parsed = tryParseJsonFromText(cleanJsonText(text));
    }
    console.log("[generateScript] parsed json:", parsed);
    let normalized = parsed ? normalizeScriptJsonShape(parsed, topic, niche, ragebaitMode) : null;
    let validation = validateStructuredPayload(normalized);
    console.log("[generateScript] missing fields:", validation?.missing || []);

    for (let attempt = 0; attempt < 2 && (!parsed || !validation.valid); attempt += 1) {
      const retryPrompt = `${prompt}

Your last response failed validation.
Missing/invalid fields: ${(validation?.missing || ["invalid_json"]).join(", ")}.
Regenerate and return ONLY pure JSON.`;
      const retry = await callWavespeed(retryPrompt, { max_tokens: 2000, temperature: 0.5 });
      console.log(`[generateScript] retry ${attempt + 1} raw response:`, retry.text);
      try {
        parsed = JSON.parse(cleanJsonText(retry.text));
      } catch {
        parsed = tryParseJsonFromText(cleanJsonText(retry.text));
      }
      console.log(`[generateScript] retry ${attempt + 1} parsed json:`, parsed);
      normalized = parsed ? normalizeScriptJsonShape(parsed, topic, niche, ragebaitMode) : null;
      validation = validateStructuredPayload(normalized);
      console.log(`[generateScript] retry ${attempt + 1} missing fields:`, validation?.missing || []);
    }

    if (parsed && normalized && !validation.valid) {
      const repairPrompt = `Regenerate ONLY missing parts for this JSON and return ONLY JSON with those fields:
Missing: ${validation.missing.join(", ")}
Current JSON:
${JSON.stringify(normalized)}
`;
      const repair = await callWavespeed(repairPrompt, { max_tokens: 1200, temperature: 0.5 });
      console.log("[generateScript] repair raw response:", repair.text);
      let repairParsed = null;
      try {
        repairParsed = JSON.parse(cleanJsonText(repair.text));
      } catch {
        repairParsed = tryParseJsonFromText(cleanJsonText(repair.text));
      }
      console.log("[generateScript] repair parsed json:", repairParsed);
      if (repairParsed && typeof repairParsed === "object") {
        normalized = normalizeScriptJsonShape(
          mergeScriptParts(normalized, repairParsed),
          topic,
          niche,
          ragebaitMode
        );
        validation = validateStructuredPayload(normalized);
        console.log("[generateScript] post-repair missing fields:", validation?.missing || []);
      }
    }

    if (!parsed || !validation.valid) {
      return res.status(502).json({ error: "Invalid AI response", missing: validation?.missing || ["invalid_json"] });
    }

    return res.json(normalized);
  } catch (error) {
    if (isProductUnavailableError(error)) {
      return res.json(
        normalizeScriptJsonShape(
          {
            hook: `Nobody is talking about this ${topic} trick`,
            hook_variations: [
              `Nobody is talking about this ${topic} trick`,
              `This is actually crazy for ${niche} creators`,
              `You won't believe this ${topic} result`
            ],
            voiceover: `Hook your ${audience} audience in 2 seconds, share one ${topic} insight, and end with a replay trigger.`,
            scenes: [
              {
                scene_number: 1,
                visual_prompt: `Close-up creator reveal in ${niche} studio, cinematic key light, quick zoom, shocked expression.`,
                camera_movement: "Close-up with quick push-in",
                lighting: "Dramatic studio key light with edge rim",
                mood: "Confident and provocative",
                subject_action: "Creator points at camera and challenges a common belief",
                text_overlay: "You are missing this"
              },
              {
                scene_number: 2,
                visual_prompt: `Wide desk setup with neon practical lights, rapid tracking shot, intense focus on steps.`,
                camera_movement: "Wide tracking shot with fast cuts",
                lighting: "Neon practical lights with deep contrast",
                mood: "High-energy and urgent",
                subject_action: "Creator breaks down the unpopular opinion in one direct line",
                text_overlay: "Do this now"
              },
              {
                scene_number: 3,
                visual_prompt: `Aesthetic payoff frame, warm lighting, smooth dolly, excited reaction for replay trigger.`,
                camera_movement: "Smooth dolly-in",
                lighting: "Warm cinematic fill with soft highlights",
                mood: "Bold and triumphant",
                subject_action: "Creator smirks and drops a final provocative takeaway",
                text_overlay: "Replay and catch step 1"
              }
            ],
            loop_ending: "You missed this part. Watch again carefully.",
            caption: `${topic} made simple for ${audience}. Save this.`,
            hashtags: ["#viral", "#reels", `#${String(niche).replace(/\s+/g, "")}`]
          },
          topic,
          niche,
          ragebaitMode
        )
      );
    }
    return sendAiError(res, error);
  }
};

export const generateIdeas = async (req, res) => {
  const { niche } = req.body || {};
  if (!niche) return res.status(400).json({ error: "niche is required" });

  const prompt = `Generate 10 viral content ideas.

Niche: ${niche}

For each idea provide:
- Title
- Hook
- Short explanation

Make ideas trendy and engaging.
If an idea includes visual framing, use cinematic and highly descriptive short-form direction (lighting, camera angle, motion, emotion) suitable for AI video tools like Kling.
${jsonInstruction('[{"title":"string","hook":"string","explanation":"string"}]')}`;

  try {
    const { data, text } = await callWavespeed(prompt, { max_tokens: 900, temperature: 0.7 });
    const parsed = tryParseJsonFromText(text);
    if (Array.isArray(parsed)) return res.json({ ideas: parsed });
    if (Array.isArray(parsed?.ideas)) return res.json({ ideas: parsed.ideas });

    return res.json({ ideas: [], rawText: text, raw: data });
  } catch (error) {
    if (isProductUnavailableError(error)) {
      return res.json({
        ideas: [
          {
            title: `${niche} Myth vs Fact`,
            hook: `Most people get ${niche} wrong. Here is the truth in 20 seconds.`,
            explanation: "Quick myth-busting format with high save potential."
          },
          {
            title: `${niche} 3-Step Framework`,
            hook: `Use this 3-step ${niche} framework before your next post.`,
            explanation: "Educational short that drives comments and shares."
          },
          {
            title: `${niche} Beginner Mistakes`,
            hook: `Avoid these 3 beginner mistakes in ${niche}.`,
            explanation: "Pain-point format that improves retention."
          }
        ],
        fallback: true,
        warning: "Wavespeed product unavailable; using local ideas fallback."
      });
    }
    return sendAiError(res, error);
  }
};

export const generateCaptionHashtags = async (req, res) => {
  const { topic, niche } = req.body || {};
  if (!topic || !niche) return res.status(400).json({ error: "topic and niche are required" });

  const prompt = `Generate a viral caption and hashtags.

Topic: ${topic}
Niche: ${niche}

Provide:
- Caption: short, engaging, TikTok/Instagram tone, with curiosity or a CTA
- Hashtags as an array of 5 to 8 tags:
  - Mix viral + niche
  - Highly relevant to topic

Hashtag rules:
- Return only hashtag strings
- Every hashtag must start with #
- Keep tags relevant to topic and niche
- If you reference visuals in the caption, use cinematic specifics instead of generic descriptions.
${jsonInstruction('{"caption":"string","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}')}`;

  try {
    const { data, text } = await callWavespeed(prompt, { max_tokens: 900, temperature: 0.7 });
    const parsed = tryParseJsonFromText(text);
    if (parsed && typeof parsed === "object") {
      return res.json({
        caption: normalizeCaption(parsed.caption, topic),
        hashtags: buildHashtagSet(topic, niche, parsed.hashtags)
      });
    }
    return res.json({ caption: normalizeCaption(text, topic), hashtags: buildHashtagSet(topic, niche), raw: data });
  } catch (error) {
    if (isProductUnavailableError(error)) {
      return res.json({
        caption: `People are split on ${topic}. What do you think?`,
        hashtags: buildHashtagSet(topic, niche),
        fallback: true,
        warning: "Wavespeed product unavailable; using local caption fallback."
      });
    }
    return sendAiError(res, error);
  }
};

export const analyzeTrends = async (req, res) => {
  const { niche } = req.body || {};
  if (!niche) return res.status(400).json({ error: "niche is required" });

  const prompt = `Analyze viral trends in this niche for cinematic AI-video content:

Niche: ${niche}

Provide:
- Top hooks used
- Common keywords
- Content style
- Emotional triggers
- Best posting tips
- Include cinematic guidance with lighting, camera angle, motion pacing, and emotional beats that work for tools like Kling.
${jsonInstruction(
    '{"topHooks":["string"],"keywords":["string"],"contentStyle":"string","emotionalTriggers":["string"],"bestPostingTips":["string"]}'
  )}`;

  try {
    const { data, text } = await callWavespeed(prompt, { max_tokens: 700, temperature: 0.7 });
    const parsed = tryParseJsonFromText(text);
    if (parsed) return res.json(parsed);
    return res.json({ topHooks: [], keywords: [], contentStyle: "", emotionalTriggers: [], bestPostingTips: [], raw: data });
  } catch (error) {
    // Graceful fallback so dashboard tools keep working if a provider product is unavailable.
    if (isProductUnavailableError(error)) {
      const nicheLabel = String(niche || "content").trim();
      return res.json({
        topHooks: [
          `Stop scrolling: ${nicheLabel} creators are doing this wrong`,
          `I tested 3 ${nicheLabel} formats and only one went viral`,
          `This ${nicheLabel} trick boosted retention in 24 hours`
        ],
        keywords: ["viral", "retention", "hook", nicheLabel],
        contentStyle: "Fast-paced short-form with clear value and CTA",
        emotionalTriggers: ["Curiosity", "Urgency", "Relatability", "Inspiration"],
        bestPostingTips: [
          "Post during evening peak slots and test 2 hook variations",
          "Keep first 2 seconds punchy with text overlays",
          "End with a question to increase comments and saves"
        ],
        fallback: true,
        warning: "Wavespeed product unavailable; using local trend fallback."
      });
    }
    return sendAiError(res, error);
  }
};

export const generateHooks = async (req, res) => {
  const { topic, niche, ragebait_mode } = req.body || {};
  const ragebaitMode = ragebait_mode === true || ragebait_mode === "true" || ragebait_mode === 1 || ragebait_mode === "1";
  if (!topic || !niche) return res.status(400).json({ error: "topic and niche are required" });

  const prompt = `Generate viral hooks.

Topic: ${topic}
Niche: ${niche}
Ragebait mode: ${ragebaitMode ? "Enabled" : "Disabled"}

Hooks must be:
- Under 10 words each
- Scroll-stopping and pattern-native to TikTok/Instagram
- Focused on curiosity, controversy, or shock
- If ragebait mode is enabled, use styles like:
  - "X is better than Y"
  - "People are wrong about this"
  - "This will trigger you..."
- If ragebait mode is disabled, use styles like:
  - "Nobody is talking about this..."
  - "This is actually crazy..."
  - "You won't believe this..."
- Keep it engaging but policy-safe and not offensive.
- If a hook implies a scene, frame it with cinematic specificity (lighting, angle, motion, emotion), not generic visuals.

Generate exactly 3 variations and select the strongest one.
${jsonInstruction('{"hook_variations":["string","string","string"],"strongest_hook":"string","hook":"string"}')}`;

  try {
    const { data, text } = await callWavespeed(prompt);
    const parsed = tryParseJsonFromText(text);
    if (parsed && typeof parsed === "object") {
      const candidate = parsed.strongest_hook || parsed.hook || parsed.hook_variations?.[0] || "";
      const hooks = buildHookSet(candidate, topic, niche, ragebaitMode);
      return res.json({
        hook: hooks.strongest_hook,
        strongest_hook: hooks.strongest_hook,
        hook_variations: hooks.hook_variations,
        ragebait_mode: ragebaitMode
      });
    }
    const hooks = buildHookSet("", topic, niche, ragebaitMode);
    return res.json({ hook: hooks.strongest_hook, strongest_hook: hooks.strongest_hook, hook_variations: hooks.hook_variations, ragebait_mode: ragebaitMode, rawText: text, raw: data });
  } catch (error) {
    if (isProductUnavailableError(error)) {
      const hooks = buildHookSet("", topic, niche, ragebaitMode);
      return res.json({
        hook: hooks.strongest_hook,
        strongest_hook: hooks.strongest_hook,
        hook_variations: hooks.hook_variations,
        ragebait_mode: ragebaitMode,
        fallback: true,
        warning: "Wavespeed product unavailable; using local hooks fallback."
      });
    }
    return sendAiError(res, error);
  }
};
