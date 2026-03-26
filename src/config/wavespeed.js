export const WAVESPEED_BASE_URL = "https://llm.wavespeed.ai/v1";
export const WAVESPEED_MODEL =
  process.env.WAVESPEED_MODEL || "openai/gpt-5.4-pro";

export function getWavespeedApiKey() {
  return process.env.WAVESPEED_API_KEY || "";
}
