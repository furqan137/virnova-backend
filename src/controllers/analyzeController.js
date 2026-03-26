import mongoose from "mongoose";
import { AnalysisResult } from "../models/AnalysisResult.js";
import {
  MissingApiKeyError,
  requestTrendAnalysis
} from "../services/wavespeedService.js";
import { CLIENT_NICHE_HIDDEN_CONTEXT } from "../services/clientNiche.js";

function buildAnalyzePrompt({ niche, links }) {
  const linkText = links.length
    ? links.map((link, index) => `${index + 1}. ${link}`).join("\n")
    : "No links provided.";

  return `You are a viral content expert.

${CLIENT_NICHE_HIDDEN_CONTEXT}

Analyze trends for ${niche} niche and return JSON with hooks, keywords, emotional triggers, engagement rate, and virality score.

Your analysis MUST be specific to this niche:
- Explain which emotional triggers (ego/anger/identity/jealousy) are used
- Explain which tensions are present (culture clash, gender roles, money/provider mindset, loyalty/status, religion vs modern)
- Reject generic insights

Input links:
${linkText}

Return STRICT JSON only:
{
  "hooks": [],
  "keywords": [],
  "triggers": [],
  "engagement": "",
  "virality": ""
}`;
}

function safeJsonParse(text) {
  try {
    return { parsed: JSON.parse(text), parseFailed: false };
  } catch {
    return { parsed: { raw: text }, parseFailed: true };
  }
}

export async function analyzeViralContent(req, res) {
  const { niche, links } = req.body || {};

  if (!niche || typeof niche !== "string") {
    return res.status(400).json({
      success: false,
      error: "niche is required and must be a string."
    });
  }

  if (links !== undefined && !Array.isArray(links)) {
    return res.status(400).json({
      success: false,
      error: "links must be an array of URLs."
    });
  }

  const normalizedLinks = (links || [])
    .map((item) => String(item).trim())
    .filter(Boolean);

  const prompt = buildAnalyzePrompt({
    niche: niche.trim(),
    links: normalizedLinks
  });

  console.log("[analyze] request started", {
    niche: niche.trim(),
    linksCount: normalizedLinks.length
  });

  try {
    const { content } = await requestTrendAnalysis({ prompt });
    const { parsed, parseFailed } = safeJsonParse(content || "");

    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      await AnalysisResult.create({
        user: userId,
        niche: niche.trim(),
        links: normalizedLinks,
        output: parsed
      });
    } catch (dbError) {
      console.warn("[analyze] save failed:", dbError.message);
    }

    return res.json({
      success: true,
      data: parsed,
      parseFailed
    });
  } catch (error) {
    console.error("[analyze] failed:", error.message);

    if (error instanceof MissingApiKeyError) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error: WAVESPEED_API_KEY is missing."
      });
    }

    const status = error?.status || error?.statusCode;
    if (status === 401) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: invalid Wavespeed API key."
      });
    }
    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please retry after some time."
      });
    }

    return res.status(502).json({
      success: false,
      error: error.message || "Wavespeed API request failed."
    });
  }
}
