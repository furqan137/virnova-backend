import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

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
  if (cleaned) return cleaned.slice(0, 140);
  return `Hot take on ${topic}. Agree or disagree?`;
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
    "#viral"
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
  return unique.slice(0, 6);
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

function cleanJsonText(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
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
      visual_prompt: String(scene.visual_prompt || ""),
      camera_style: String(scene.camera_style || scene.camera_movement || ""),
      text_overlay: String(scene.text_overlay || "")
    }));

  while (scenes.length < 3) {
    scenes.push({
      scene_number: scenes.length + 1,
      visual_prompt: `Scene ${scenes.length + 1} for ${topic}, cinematic lighting, dynamic motion, intense emotion.`,
      camera_style: "Close-up with fast push-in",
      text_overlay: `Scene ${scenes.length + 1}`
    });
  }

  return {
    hook: hooks.strongest_hook,
    hook_variations: hookVariations,
    voiceover: String(payload.voiceover || payload.script || ""),
    scenes: scenes.slice(0, 5),
    loop_ending: buildLoopEnding(payload.loop_ending || payload.loopEnding, hooks.strongest_hook, topic),
    caption: String(payload.caption || ""),
    hashtags: (Array.isArray(payload.hashtags) ? payload.hashtags : []).map((tag) => String(tag)).filter(Boolean)
  };
}

async function callWavespeed(prompt) {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) {
    throw new Error("WAVESPEED_API_KEY is missing in .env");
  }

  const response = await fetch(`${WAVESPEED_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: WAVESPEED_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 1
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const msgFromApi =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      data?.message;
    const fallbackMessage =
      response.status === 401
        ? "Unauthorized: invalid Wavespeed API key."
        : response.status === 429
        ? "Rate limit exceeded by Wavespeed. Please retry shortly."
        : "Wavespeed LLM request failed";

    throw new WavespeedHttpError(
      msgFromApi || fallbackMessage,
      response.status,
      data
    );
  }

  const text = extractText(data);
  return { data, text };
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
    const { data, text } = await callWavespeed(prompt);
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

Return structured scene-by-scene output for a high-retention short-form reel.
Use 3 to 5 scenes total, optimized for a 6-12 second reel.
Each scene must include:
- scene_number
- visual_prompt (cinematic Kling-style prompt ready for AI video tools)
- action (what is happening)
- emotion_or_reaction (visible feeling/reaction)
- camera_movement (close-up, zoom, dolly, whip pan, etc.)
- text_overlay
- duration_seconds (1-4)

Also include:
- hook
- hook_variations (exactly 3)
- voiceover
- loop_ending
- caption
- hashtags (10)

Hook mode rules:
- If ragebait mode is enabled: generate controversial opinion-based hooks using debate, comparison, or cultural statement framing to spark comments and reactions.
- If ragebait mode is disabled: use curiosity/shock pattern hooks like "Nobody is talking about this...", "This is actually crazy...", and "You won't believe this...".
- Keep all hooks policy-safe and non-offensive (no hate, abuse, or targeted harassment).
- "loop_ending" must connect back to the hook, create curiosity, and encourage rewatch.
- Make the ending naturally loop into the beginning.
- If reference viral content is provided, analyze it and mimic its structure, pacing, and tone.
- If reference viral content is not provided, rely on general viral content patterns.
- Platform tuning:
  - TikTok: more aggressive hooks, faster pacing, stronger pattern interrupts.
  - Instagram Reels: cleaner style, slightly smoother pacing, more aesthetic visual composition.
- All scene "visual_prompt" outputs must be cinematic and Kling-ready, explicitly including:
  - lighting style (cinematic, neon, natural, practical, etc.)
  - camera angle (close-up, wide, low-angle, overhead, drone, POV)
  - motion (fast cuts, zoom, tracking shot, dolly, whip pan, handheld)
  - visible emotion (excited, shocked, intense, curious, etc.)
- Avoid generic prompts like "a man walking"; use specific, vivid scene descriptions.

Make it fast-paced, highly engaging, and designed for looping retention.
${jsonInstruction(
    '{"hook":"string","hook_variations":["string","string","string"],"voiceover":"string","scenes":[{"scene_number":1,"visual_prompt":"string","camera_style":"string","text_overlay":"string"}],"loop_ending":"string","caption":"string","hashtags":["#tag1","#tag2"]}'
  )}`;

  try {
    const { data, text } = await callWavespeed(prompt);
    let parsed = null;
    try {
      parsed = JSON.parse(cleanJsonText(text));
    } catch {
      parsed = tryParseJsonFromText(cleanJsonText(text));
    }

    if (parsed && typeof parsed === "object") {
      return res.json(normalizeScriptJsonShape(parsed, topic, niche, ragebaitMode));
    }

    return res.status(502).json({ error: "AI did not return valid JSON", statusCode: 502 });
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
                camera_style: "Close-up with quick push-in",
                text_overlay: "You are missing this"
              },
              {
                scene_number: 2,
                visual_prompt: `Wide desk setup with neon practical lights, rapid tracking shot, intense focus on steps.`,
                camera_style: "Wide tracking shot with fast cuts",
                text_overlay: "Do this now"
              },
              {
                scene_number: 3,
                visual_prompt: `Aesthetic payoff frame, warm lighting, smooth dolly, excited reaction for replay trigger.`,
                camera_style: "Smooth dolly-in",
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
    const { data, text } = await callWavespeed(prompt);
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
- Hashtags as an array of exactly 6 tags:
  - 3 niche-specific hashtags
  - 2 medium-competition hashtags
  - 1 broad trending hashtag

Hashtag rules:
- Return only hashtag strings
- Every hashtag must start with #
- Keep tags relevant to topic and niche
- If you reference visuals in the caption, use cinematic specifics instead of generic descriptions.
${jsonInstruction('{"caption":"string","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6"]}')}`;

  try {
    const { data, text } = await callWavespeed(prompt);
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
    const { data, text } = await callWavespeed(prompt);
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
