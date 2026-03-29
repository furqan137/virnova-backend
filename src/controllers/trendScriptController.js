import { generateStrictJson, MASTER_SYSTEM_PROMPT } from "../services/llmClient.js";
import { CLIENT_NICHE_HIDDEN_CONTEXT } from "../services/clientNiche.js";
import { WAVESPEED_TREND_SCOUT_MODEL } from "../config/wavespeed.js";

const SCENE_LABELS = [
  "Hook - first 3 seconds",
  "Scene 2",
  "Scene 3",
  "Scene 4",
  "Climax / Twist",
  "Ending / Call to Action"
];

const DEFAULT_ANGLES = [
  "Direct POV — stop the scroll cold",
  "Pattern interrupt — twist mid-video",
  "Soft landing — comment bait CTA"
];

const DEFAULT_SCENE_CAMERA = "Close-up on face, slight handheld micro-shake, punchy TikTok pacing";

function isGenericVideoPrompt(text) {
  const t = String(text || "").trim();
  if (t.length < 85) return true;
  return /\ba person doing something|someone doing something|generic (person|scene|video)|\bTBD\b|\blorem\b|placeholder/i.test(
    t
  );
}

function synthesizeVideoPrompt({ visual, dialogue, caption, emotion, camera }) {
  const cam = String(camera || DEFAULT_SCENE_CAMERA).trim();
  const dia = String(dialogue || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const cap = String(caption || "").replace(/\s+/g, " ").trim().slice(0, 72);
  const vis = String(visual || "").replace(/\s+/g, " ").trim();
  const em = String(emotion || "tension").trim();
  return (
    `Vertical 9:16 video, realistic cinematic style, high detail, natural skin texture, no watermarks. ` +
    `${vis} ` +
    `Subject delivers energy matching this spoken POV: "${dia}". ` +
    `Emotional read: ${em}. ` +
    `On-screen text vibe: "${cap}". ` +
    `Camera: ${cam}. ` +
    `Natural or motivated lighting with soft shadows and gentle contrast. ` +
    `Shallow depth of field, background slightly blurred, filmic color grade.`
  );
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function safeParse(text) {
  const source = String(text || "");
  try {
    return JSON.parse(source);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[generate-script-from-trend] JSON ERROR:", e?.message || e);
    const cleaned = source
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
}

/** Accept partial LLM output so retries can still succeed; full strict check after normalize. */
function validateLlmPayload(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(obj.viral_scripts) && obj.viral_scripts.length > 0) {
    const scenes = obj.viral_scripts[0]?.scenes;
    return Array.isArray(scenes) && scenes.length >= 3;
  }
  if (!isBlank(obj.hook) && !isBlank(obj.script) && Array.isArray(obj.scenes) && obj.scenes.length >= 2) return true;
  return false;
}

function normalizeScene(raw, idx, trendHook) {
  const label = String(raw?.label || SCENE_LABELS[idx] || `Scene ${idx + 1}`).trim() || SCENE_LABELS[idx];
  const visual =
    String(raw?.visual || "").trim() || "Tight face cam, natural light, fast energy, handheld.";
  const dialogue =
    String(raw?.dialogue || raw?.voiceover || "").trim() ||
    String(trendHook || "").trim() ||
    "You need to hear this.";
  const caption = String(raw?.caption || raw?.text_overlay || "").trim() || "wait—";
  const emotion = String(raw?.emotion || "").trim() || "curiosity";
  const camera =
    String(raw?.camera || raw?.camera_movement || raw?.camera_style || "").trim() || DEFAULT_SCENE_CAMERA;

  let video_prompt = String(raw?.video_prompt || "").trim();
  if (isBlank(video_prompt) || isGenericVideoPrompt(video_prompt)) {
    video_prompt = synthesizeVideoPrompt({ visual, dialogue, caption, emotion, camera });
  }

  return {
    scene: Number(raw?.scene) || idx + 1,
    label,
    visual,
    dialogue,
    caption,
    emotion,
    camera,
    video_prompt
  };
}

function padScenesToSix(scenesIn, trendHook) {
  const base = Array.isArray(scenesIn) ? scenesIn.filter((s) => s && typeof s === "object") : [];
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    out.push(normalizeScene(base[i] || {}, i, trendHook));
  }
  return out;
}

function legacyToViralScripts(parsed, trend) {
  const hook = String(parsed?.hook || trend?.hook || "").trim();
  const script = String(parsed?.script || "").trim();
  const lines = script.split("\n").map((l) => l.trim()).filter(Boolean);
  const legacyScenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const scenes = [];
  for (let i = 0; i < 6; i += 1) {
    const s = legacyScenes[i] || {};
    const vo = String(s.voiceover || lines[i] || lines[0] || hook).trim();
    const vis = String(s.visual || "").trim() || "Front cam, bold energy, quick cuts.";
    const cap = String(s.text_overlay || hook).trim() || "👀";
    const emo = i === 0 ? "curiosity" : i === 4 ? "shock" : i === 5 ? "belonging" : "tension";
    const cam =
      String(s.camera || s.camera_movement || "").trim() ||
      (i === 0 ? "Extreme close-up front cam, handheld" : "Medium close-up, quick reframing");
    scenes.push({
      scene: i + 1,
      label: SCENE_LABELS[i],
      visual: vis,
      dialogue: vo,
      caption: cap,
      emotion: emo,
      camera: cam,
      video_prompt: synthesizeVideoPrompt({
        visual: vis,
        dialogue: vo,
        caption: cap,
        emotion: emo,
        camera: cam
      })
    });
  }
  return [
    { variation: 1, angle: DEFAULT_ANGLES[0], scenes },
    {
      variation: 2,
      angle: DEFAULT_ANGLES[1],
      scenes: scenes.map((sc, j) => {
        const dialogue = j === 2 ? `${sc.dialogue} (beat—wrong take?)` : sc.dialogue;
        return {
          ...sc,
          dialogue,
          video_prompt: synthesizeVideoPrompt({
            visual: sc.visual,
            dialogue,
            caption: sc.caption,
            emotion: sc.emotion,
            camera: sc.camera
          })
        };
      })
    },
    {
      variation: 3,
      angle: DEFAULT_ANGLES[2],
      scenes: scenes.map((sc, j) => {
        const dialogue = j === 5 ? `${sc.dialogue} Comment if you felt this.` : sc.dialogue;
        return {
          ...sc,
          dialogue,
          video_prompt: synthesizeVideoPrompt({
            visual: sc.visual,
            dialogue,
            caption: sc.caption,
            emotion: sc.emotion,
            camera: sc.camera
          })
        };
      })
    }
  ];
}

function ensureThreeViralScripts(viral_scripts, trend, parsed) {
  const hook = String(trend?.hook || "").trim();
  let list = Array.isArray(viral_scripts) ? viral_scripts.filter((v) => v && typeof v === "object") : [];
  if (list.length === 0 && parsed && (parsed.hook || parsed.script)) {
    list = legacyToViralScripts(parsed, trend);
  }
  const normalized = list.map((vs, idx) => {
    const variation = Number(vs.variation) || idx + 1;
    const angle = String(vs.angle || vs.title || DEFAULT_ANGLES[idx] || `Script ${idx + 1}`).trim();
    const scenes = padScenesToSix(vs.scenes, hook);
    return { variation, angle, scenes };
  });
  while (normalized.length < 3) {
    const i = normalized.length;
    const cloneFrom = normalized[Math.max(0, i - 1)] || { scenes: padScenesToSix([], hook) };
    normalized.push({
      variation: i + 1,
      angle: DEFAULT_ANGLES[i] || `Script ${i + 1}`,
      scenes: cloneFrom.scenes.map((sc, j) => {
        const dialogue =
          j === 1
            ? `${sc.dialogue} (hard cut—new angle)`
            : j === 4
              ? `${sc.dialogue} Plot twist.`
              : sc.dialogue;
        const next = { ...sc, scene: j + 1, dialogue };
        return {
          ...next,
          video_prompt: synthesizeVideoPrompt({
            visual: next.visual,
            dialogue: next.dialogue,
            caption: next.caption,
            emotion: next.emotion,
            camera: next.camera
          })
        };
      })
    });
  }
  return normalized.slice(0, 3).map((v, idx) => ({
    ...v,
    variation: idx + 1,
    angle: v.angle || DEFAULT_ANGLES[idx]
  }));
}

function buildFormattedExport(topic, viral_scripts, caption, hashtags) {
  const lines = [];
  lines.push(`Topic: ${topic}`);
  lines.push("");
  viral_scripts.forEach((vs, si) => {
    lines.push(`━━━ VIRAL SCRIPT ${si + 1}${vs.angle ? ` — ${vs.angle}` : ""} ━━━`);
    lines.push("");
    (vs.scenes || []).forEach((sc) => {
      lines.push(`Scene ${sc.scene} (${sc.label}):`);
      lines.push(`- Visual: ${sc.visual}`);
      lines.push(`- Dialogue/Voiceover: ${sc.dialogue}`);
      lines.push(`- Caption/Text on screen: ${sc.caption}`);
      lines.push(`- Camera: ${sc.camera || DEFAULT_SCENE_CAMERA}`);
      lines.push(`- Emotion: ${sc.emotion}`);
      lines.push(`- AI video prompt (Runway/Pika/Sora-ready): ${sc.video_prompt || ""}`);
      lines.push("");
    });
  });
  lines.push("Caption:");
  lines.push(caption);
  lines.push("");
  lines.push("Hashtags:");
  lines.push((hashtags || []).join(" "));
  return lines.join("\n").trim();
}

function normalizeResult(parsed, trend) {
  const base = parsed && typeof parsed === "object" ? parsed : {};
  const topic = String(base.topic || trend?.title || trend?.hook || "Trend topic").trim() || "Trend topic";

  const viral_scripts = ensureThreeViralScripts(base.viral_scripts, trend, base);
  const primary = viral_scripts[0];
  const firstScene = primary?.scenes?.[0];
  const hook = String(base.hook || firstScene?.dialogue || trend?.hook || "").trim() || "POV: you almost scrolled past this";
  const script = (primary?.scenes || []).map((s) => s.dialogue).join("\n");

  const legacyScenes = (primary?.scenes || []).map((s, idx) => ({
    scene: s.scene || idx + 1,
    visual: s.visual,
    voiceover: s.dialogue,
    text_overlay: s.caption,
    camera: s.camera || DEFAULT_SCENE_CAMERA,
    video_prompt: s.video_prompt,
    label: s.label,
    emotion: s.emotion
  }));

  let caption = String(base.caption || "").trim();
  if (isBlank(caption)) {
    caption = "the algorithm needed you to see this";
  }

  let loop_ending = String(base.loop_ending || "").trim();
  if (isBlank(loop_ending)) {
    const hookWords = hook.split(/\s+/).slice(0, 5).join(" ");
    loop_ending = `Loop: jump cut back to “${hookWords}”`;
  }

  const hashtags = Array.isArray(base.hashtags) ? base.hashtags.map((t) => String(t || "").trim()).filter(Boolean) : [];
  const uniq = [...new Set(hashtags)];
  while (uniq.length < 5) uniq.push(`#fyp${uniq.length + 1}`);

  const formatted_export = buildFormattedExport(topic, viral_scripts, caption, uniq);

  return {
    topic,
    viral_scripts,
    hook,
    script,
    scenes: legacyScenes,
    caption,
    hashtags: uniq.slice(0, 12),
    loop_ending,
    formatted_export
  };
}

function validateNormalized(value) {
  if (!value || typeof value !== "object") return { valid: false, missing: ["root"] };
  const missing = [];
  if (isBlank(value.topic)) missing.push("topic");
  if (!Array.isArray(value.viral_scripts) || value.viral_scripts.length !== 3) missing.push("viral_scripts(3)");
  else {
    value.viral_scripts.forEach((vs, i) => {
      if (!Array.isArray(vs.scenes) || vs.scenes.length !== 6) missing.push(`script${i + 1}.scenes(6)`);
      else {
        vs.scenes.forEach((sc, j) => {
          if (isBlank(sc.visual)) missing.push(`s${i + 1}.${j}.visual`);
          if (isBlank(sc.dialogue)) missing.push(`s${i + 1}.${j}.dialogue`);
          if (isBlank(sc.caption)) missing.push(`s${i + 1}.${j}.caption`);
          if (isBlank(sc.emotion)) missing.push(`s${i + 1}.${j}.emotion`);
          if (isBlank(sc.camera)) missing.push(`s${i + 1}.${j}.camera`);
          if (isBlank(sc.video_prompt) || isGenericVideoPrompt(sc.video_prompt)) {
            missing.push(`s${i + 1}.${j}.video_prompt`);
          }
        });
      }
    });
  }
  if (isBlank(value.caption)) missing.push("caption");
  if (!Array.isArray(value.hashtags) || value.hashtags.length < 5) missing.push("hashtags(>=5)");
  if (isBlank(value.loop_ending)) missing.push("loop_ending");
  return { valid: missing.length === 0, missing };
}

const FALLBACK_HASHTAGS = ["#fyp", "#viral", "#reels", "#shorts", "#storytime"];

export async function generateScriptFromTrend(req, res) {
  const trend = req.body?.trend;
  // eslint-disable-next-line no-console
  console.log("[generate-script-from-trend] REQUEST RECEIVED:", req.body);
  if (!trend || typeof trend !== "object") {
    return res.status(400).json({ success: false, error: "trend object is required" });
  }

  // eslint-disable-next-line no-console
  console.log("[generate-script-from-trend] TREND SENT:", trend);

  const prompt = `
You are an expert viral short-form creator (TikTok, Reels, YouTube Shorts).
Generate HIGH-QUALITY, REALISTIC scripts — not generic AI filler.

RULES:
- Hook-driven, emotional, fast-paced, scroll-stopping
- NEVER use: "Welcome back", "In this video", "Today we're going to", "As you can see", "Let's dive in"
- Short punchy lines; sound HUMAN; include at least one pattern interrupt (unexpected beat) per script
- Strong curiosity gaps + storytelling; vary tone across the 3 scripts (e.g. direct POV vs twist vs softer CTA)
- For EACH scene you MUST output "camera" (shot type + movement) and "video_prompt": a single highly detailed, cinematic, ready-to-paste AI video generation prompt for tools like Runway, Pika, or Sora.
- Each video_prompt MUST: state vertical 9:16; describe environment, subject, wardrobe if visible, expression, emotion, camera angle/movement, lighting, realistic/cinematic style; be specific (NO placeholders, NO "a person doing something"); align with that scene's visual, dialogue, caption, and emotion.

${CLIENT_NICHE_HIDDEN_CONTEXT}

CLIENT TOPIC / TREND (use as the "Topic" and anchor every line to this):
- Title: ${String(trend?.title || "")}
- Hook: ${String(trend?.hook || "")}
- Type: ${String(trend?.content_type || "")}
- Summary: ${String(trend?.summary || "")}
- Why it works: ${JSON.stringify(trend?.why_it_works || {})}
- Adaptation: ${String(trend?.adaptation_for_user || "")}

OUTPUT: ONE JSON OBJECT ONLY (no markdown, no commentary).

Schema:
{
  "topic": "clear topic string",
  "viral_scripts": [
    {
      "variation": 1,
      "angle": "one-line name for this variant",
      "scenes": [
        {
          "scene": 1,
          "label": "Hook - first 3 seconds",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        },
        {
          "scene": 2,
          "label": "Scene 2",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        },
        {
          "scene": 3,
          "label": "Scene 3",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        },
        {
          "scene": 4,
          "label": "Scene 4",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        },
        {
          "scene": 5,
          "label": "Climax / Twist",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        },
        {
          "scene": 6,
          "label": "Ending / Call to Action",
          "visual": "",
          "dialogue": "",
          "caption": "",
          "emotion": "",
          "camera": "",
          "video_prompt": ""
        }
      ]
    },
    { "variation": 2, "angle": "", "scenes": [ /* same 6 scenes structure */ ] },
    { "variation": 3, "angle": "", "scenes": [ /* same 6 scenes structure */ ] }
  ],
  "caption": "platform caption line",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6"],
  "loop_ending": "how to loop seamlessly"
}

Hard requirements:
- Exactly 3 objects in viral_scripts
- Each scenes array MUST have exactly 6 objects in order (hook → … → CTA)
- Every visual, dialogue, caption, emotion, camera, video_prompt must be non-empty strings
- dialogue = exact spoken line / voiceover (natural, viral)
- caption = short on-screen text
- emotion = one word or short phrase (e.g. curiosity, shock, anger, hope, guilt, belonging)
- video_prompt = one paragraph, paste-ready for AI video generators (see rules above)
`.trim();

  const fallbackPayload = {
    topic: String(trend?.title || trend?.hook || "Trend topic").trim(),
    viral_scripts: legacyToViralScripts(
      {
        hook: String(trend?.hook || "POV: you almost said yes to the wrong thing."),
        script: `${String(trend?.hook || "")}\nPause. Read that again.\nThat’s not drama — that’s a boundary.\nComment “facts” if you felt this.`,
        scenes: []
      },
      trend
    ),
    caption: "save this before you need it",
    hashtags: FALLBACK_HASHTAGS,
    loop_ending: "Hard cut back to the first line of the hook."
  };

  try {
    const { parsed, raw } = await generateStrictJson({
      systemPrompt: MASTER_SYSTEM_PROMPT,
      userPrompt: prompt,
      model: WAVESPEED_TREND_SCOUT_MODEL,
      temperature: 0.75,
      max_tokens: 5600,
      retries: 2,
      validate: (obj) => validateLlmPayload(obj),
      enforceGenericCheck: false
    });

    // eslint-disable-next-line no-console
    console.log("[generate-script-from-trend] RAW LLM RESPONSE:", raw);
    const parsedSafe = parsed || safeParse(raw);
    // eslint-disable-next-line no-console
    console.log("[generate-script-from-trend] PARSED RESPONSE:", parsedSafe);

    const normalized = normalizeResult(parsedSafe, trend);
    const validation = validateNormalized(normalized);
    if (!validation.valid) {
      // eslint-disable-next-line no-console
      console.warn("[generate-script-from-trend] validation failed:", validation.missing);
      const fb = normalizeResult(fallbackPayload, trend);
      return res.json({ success: true, data: fb, fallback: true });
    }

    return res.json({ success: true, data: normalized });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[generate-script-from-trend] error:", error?.message || error);
    const fb = normalizeResult(fallbackPayload, trend);
    return res.json({ success: true, data: fb, fallback: true });
  }
}
