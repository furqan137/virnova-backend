import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";
import { MASTER_SYSTEM_PROMPT, MissingApiKeyError as SharedMissingApiKeyError, chatCompletion } from "./llmClient.js";

export class MissingApiKeyError extends Error {
  constructor() {
    super("WAVESPEED_API_KEY is missing.");
    this.name = "MissingApiKeyError";
  }
}

export async function requestTrendAnalysis({ prompt }) {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) throw new (SharedMissingApiKeyError || MissingApiKeyError)();

  console.log("[wavespeed] sending request", { model: WAVESPEED_MODEL });

  const completion = await chatCompletion({
    model: WAVESPEED_MODEL,
    temperature: 0.7,
    max_tokens: 2000,
    messages: [
      { role: "system", content: MASTER_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  });

  const content = completion?.choices?.[0]?.message?.content || "";
  console.log("[wavespeed] response received", {
    hasContent: Boolean(content),
    choices: completion?.choices?.length || 0
  });

  return { completion, content };
}
