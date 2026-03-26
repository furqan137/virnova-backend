export const WAVESPEED_BASE_URL = "https://llm.wavespeed.ai/v1";
export const WAVESPEED_MODEL =
  process.env.WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash";
export const WAVESPEED_FALLBACK_MODEL =
  process.env.WAVESPEED_FALLBACK_MODEL || "bytedance-seed/seed-1.6-flash";
export const WAVESPEED_TREND_SCOUT_MODEL =
  process.env.WAVESPEED_TREND_SCOUT_MODEL || "openai/gpt-4.1";

export function getWavespeedApiKey() {
  return process.env.WAVESPEED_API_KEY || "";
}
