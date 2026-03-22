import OpenAI from "openai";
import {
  getWavespeedApiKey,
  WAVESPEED_BASE_URL,
  WAVESPEED_MODEL
} from "../config/wavespeed.js";

export class MissingApiKeyError extends Error {
  constructor() {
    super("WAVESPEED_API_KEY is missing.");
    this.name = "MissingApiKeyError";
  }
}

export async function requestTrendAnalysis({ prompt }) {
  const apiKey = getWavespeedApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const client = new OpenAI({
    apiKey,
    baseURL: WAVESPEED_BASE_URL
  });

  console.log("[wavespeed] sending request", { model: WAVESPEED_MODEL });

  const completion = await client.chat.completions.create({
    model: WAVESPEED_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
    temperature: 0.7,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0
  });

  const content = completion?.choices?.[0]?.message?.content || "";
  console.log("[wavespeed] response received", {
    hasContent: Boolean(content),
    choices: completion?.choices?.length || 0
  });

  return { completion, content };
}
