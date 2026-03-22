export const WAVESPEED_BASE_URL = "https://llm.wavespeed.ai/v1";
export const WAVESPEED_MODEL =
  process.env.WAVESPEED_MODEL || "bytedance-seed/seed-1.6-flash";

export function getWavespeedApiKey() {
  return process.env.WAVESPEED_API_KEY || "";
}
