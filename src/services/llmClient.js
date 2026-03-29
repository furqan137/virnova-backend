import OpenAI from "openai";
import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_FALLBACK_MODEL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

export const MASTER_SYSTEM_PROMPT = `You are an elite viral content strategist AI.

You specialize in:
- Instagram Reels
- TikTok content
- Viral hooks
- Ragebait and POV storytelling
- Cultural and controversial content

Your job is NOT to generate generic content.
Your job is to:
- Create HIGH-RETENTION short-form content
- Focus on emotional triggers (curiosity, anger, identity, shock)
- Generate content optimized for engagement and shares

STRICT RULES:
- Always return VALID JSON when requested
- No empty fields
- No generic outputs
- Keep responses sharp, punchy, and actionable
- Prioritize HOOK quality above everything

Think like a top 0.1% content creator.`;

export class MissingApiKeyError extends Error {
  constructor() {
    super("WAVESPEED_API_KEY is missing.");
    this.name = "MissingApiKeyError";
  }
}

function cleanJsonText(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseFirstJsonObject(text) {
  const trimmed = cleanJsonText(text);
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function looksGeneric(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return true;
  return (
    t.includes("as an ai") ||
    t.includes("here's") ||
    t.includes("i can") ||
    t.includes("generic") ||
    t.includes("in conclusion")
  );
}

function createClient() {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) throw new MissingApiKeyError();
  return new OpenAI({
    apiKey,
    baseURL: WAVESPEED_BASE_URL,
    timeout: 60_000,
    maxRetries: 1
  });
}

function isLikelyModelError(error) {
  const status = error?.status ?? error?.response?.status;
  const msg = String(error?.message || "").toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    msg.includes("model") ||
    msg.includes("not found") ||
    msg.includes("unsupported") ||
    msg.includes("does not exist")
  );
}

export async function chatCompletion({
  messages,
  model = WAVESPEED_MODEL,
  temperature = 0.7,
  max_tokens = 2000
}) {
  const client = createClient();
  try {
    return await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens
    });
  } catch (error) {
    const fallback = WAVESPEED_FALLBACK_MODEL;
    const canFallback = fallback && fallback !== model && isLikelyModelError(error);
    if (!canFallback) throw error;
    // eslint-disable-next-line no-console
    console.warn("[llm] primary model failed, retrying with fallback", {
      primary: model,
      fallback
    });
    return await client.chat.completions.create({
      model: fallback,
      messages,
      temperature: Math.max(0.5, temperature - 0.2),
      max_tokens
    });
  }
}

/**
 * Generate STRICT JSON with retries + quality enforcement.
 * - Retries malformed JSON
 * - Retries empty/low-quality content
 * - Drops temperature on retry
 */
export async function generateStrictJson({
  systemPrompt = MASTER_SYSTEM_PROMPT,
  userPrompt,
  model = WAVESPEED_MODEL,
  temperature = 0.7,
  max_tokens = 2000,
  retries = 2,
  validate,
  /** When false, skip looksGeneric() so JSON dialogue fields can contain casual phrases. */
  enforceGenericCheck = true
}) {
  let lastText = "";
  let lastParsed = null;
  let currentTemp = temperature;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const completion = await chatCompletion({
      model,
      temperature: currentTemp,
      max_tokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const content = completion?.choices?.[0]?.message?.content || "";
    lastText = content;
    const parsed = parseFirstJsonObject(content);
    lastParsed = parsed;

    const valid = typeof validate === "function" ? validate(parsed) : Boolean(parsed);
    const generic = enforceGenericCheck ? looksGeneric(content) : false;

    if (parsed && valid && !generic) {
      return { parsed, raw: content, completion };
    }

    // tighten on retry
    currentTemp = Math.max(0.5, currentTemp - 0.2);
  }

  return { parsed: lastParsed, raw: lastText, completion: null };
}

