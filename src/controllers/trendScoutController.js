import mongoose from "mongoose";
import { TrendScoutItem } from "../models/TrendScoutItem.js";
import { createTrendScoutFeed, buildTrendScoutPrompt } from "../services/trendScoutEngine.js";
import { WAVESPEED_TREND_SCOUT_MODEL } from "../config/wavespeed.js";
import { generateStrictJson, MASTER_SYSTEM_PROMPT } from "../services/llmClient.js";

const ALLOWED_SUB_NICHE_FILTERS = new Set([
  "cultural duality",
  "immigration narratives",
  "religious tension",
  "family conflict",
  "interracial relationships",
  "controversial opinions"
]);

const ALLOWED_CONTENT_STYLES = new Set(["POV", "ragebait", "dark humor", "text-overlay reels"]);
const ALLOWED_GEOGRAPHIES = new Set(["US", "Middle East", "North Africa", "Arab world"]);

function toStringList(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeScoutItem(doc) {
  const item = doc.toObject ? doc.toObject() : doc;
  return {
    id: item._id?.toString?.() || item.id,
    title: item.title,
    hook: item.hook,
    content_type: item.content_type,
    niche_relevance_score: item.niche_relevance_score,
    engagement_velocity_score: item.engagement_velocity_score,
    virality_status: item.virality_status,
    estimated_views: item.estimated_views,
    hours_since_posted: item.hours_since_posted,
    comment_rate: item.comment_rate,
    share_rate: item.share_rate,
    summary: item.summary,
    why_it_works: item.why_it_works,
    text_overlay_breakdown: item.text_overlay_breakdown,
    caption_analysis: item.caption_analysis,
    hashtag_analysis: item.hashtag_analysis,
    adaptation_for_user: item.adaptation_for_user,
    timestamp: item.timestamp || item.createdAt,
    freshness: item.freshness,
    status: item.status,
    niche: item.niche,
    sub_niche_filters: item.sub_niche_filters,
    content_styles: item.content_styles,
    geography: item.geography
  };
}

export async function generateTrendScoutFeed(req, res) {
  const {
    niche,
    sub_niche_filters: subNicheRaw,
    content_style: contentStyleRaw,
    geography
  } = req.body || {};

  if (!niche || typeof niche !== "string" || !niche.trim()) {
    return res.status(400).json({ success: false, error: "niche is required." });
  }

  const subNicheFilters = toStringList(subNicheRaw).filter((item) => ALLOWED_SUB_NICHE_FILTERS.has(item));
  const contentStyles = toStringList(contentStyleRaw).filter((item) => ALLOWED_CONTENT_STYLES.has(item));
  const normalizedGeo = ALLOWED_GEOGRAPHIES.has(String(geography || "").trim())
    ? String(geography).trim()
    : "US";

  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    // Trend Scout uses a premium model (configurable) to produce higher-quality ideas,
    // but falls back to deterministic simulation if the provider fails.
    let generated = [];
    try {
      const prompt = buildTrendScoutPrompt({
        niche: niche.trim(),
        subNicheFilters,
        contentStyles,
        geography: normalizedGeo
      });
      const llm = await generateStrictJson({
        systemPrompt: MASTER_SYSTEM_PROMPT,
        userPrompt: prompt,
        model: WAVESPEED_TREND_SCOUT_MODEL,
        temperature: 0.7,
        max_tokens: 2400,
        retries: 1,
        validate(parsed) {
          return Array.isArray(parsed) && parsed.length >= 6;
        }
      });
      if (Array.isArray(llm?.parsed)) {
        generated = llm.parsed;
      }
    } catch (_error) {
      generated = [];
    }

    if (!generated.length) {
      generated = createTrendScoutFeed({
        niche: niche.trim(),
        subNicheFilters,
        contentStyles,
        geography: normalizedGeo
      });
    }

    const batchId = new mongoose.Types.ObjectId().toString();
    const created = [];

    for (const item of generated) {
      const docPayload = {
        user: userId,
        niche: niche.trim(),
        sub_niche_filters: subNicheFilters,
        content_styles: contentStyles,
        geography: normalizedGeo,
        ...item,
        source_batch_id: batchId,
        status: "fresh"
      };

      try {
        const inserted = await TrendScoutItem.create(docPayload);
        created.push(inserted);
      } catch (error) {
        if (error?.code === 11000) {
          const existing = await TrendScoutItem.findOne({
            user: userId,
            niche: niche.trim(),
            title: item.title
          });
          if (existing) created.push(existing);
          continue;
        }
        throw error;
      }
    }

    const normalized = created
      .map(normalizeScoutItem)
      .filter((item) => item.niche_relevance_score >= 7)
      .sort(
        (a, b) =>
          b.niche_relevance_score - a.niche_relevance_score ||
          b.engagement_velocity_score - a.engagement_velocity_score
      );

    return res.json({
      success: true,
      data: normalized,
      meta: {
        batch_id: batchId,
        total: normalized.length
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[trend-scout] generate failed:", error.message);
    return res.status(500).json({ success: false, error: "Failed to generate trend scout feed." });
  }
}

export async function listTrendScoutIdeas(req, res) {
  const status = String(req.query.status || "fresh").trim().toLowerCase();
  const validStatus = ["fresh", "saved", "used"].includes(status) ? status : "fresh";

  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const items = await TrendScoutItem.find({ user: userId, status: validStatus })
      .sort({ niche_relevance_score: -1, engagement_velocity_score: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, data: items.map(normalizeScoutItem) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[trend-scout] list failed:", error.message);
    return res.status(500).json({ success: false, error: "Failed to fetch trend scout ideas." });
  }
}

export async function updateTrendScoutIdeaStatus(req, res) {
  const status = String(req.body?.status || "").trim().toLowerCase();
  if (!["fresh", "saved", "used"].includes(status)) {
    return res.status(400).json({ success: false, error: "status must be fresh, saved, or used." });
  }

  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const updated = await TrendScoutItem.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { status },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: "Trend idea not found." });
    }
    return res.json({ success: true, data: normalizeScoutItem(updated) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[trend-scout] update status failed:", error.message);
    return res.status(400).json({ success: false, error: "Failed to update trend idea status." });
  }
}
