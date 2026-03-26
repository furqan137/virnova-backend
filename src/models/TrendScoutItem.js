import mongoose from "mongoose";

const whyItWorksSchema = new mongoose.Schema(
  {
    hook_type: { type: String, trim: true, default: "" },
    emotion_trigger: { type: String, trim: true, default: "" },
    tension_point: { type: String, trim: true, default: "" },
    format: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const trendScoutItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    niche: { type: String, trim: true, required: true, index: true },
    sub_niche_filters: [{ type: String, trim: true }],
    content_styles: [{ type: String, trim: true }],
    geography: { type: String, trim: true, default: "US" },
    title: { type: String, trim: true, required: true },
    hook: { type: String, trim: true, required: true },
    content_type: { type: String, trim: true, required: true },
    niche_relevance_score: { type: Number, required: true, min: 1, max: 10 },
    engagement_velocity_score: { type: Number, required: true, min: 0 },
    virality_status: { type: String, trim: true, required: true },
    estimated_views: { type: Number, required: true, min: 0 },
    hours_since_posted: { type: Number, required: true, min: 1 },
    comment_rate: { type: Number, required: true, min: 0 },
    share_rate: { type: Number, required: true, min: 0 },
    summary: { type: String, trim: true, required: true },
    why_it_works: { type: whyItWorksSchema, required: true },
    text_overlay_breakdown: { type: String, trim: true, required: true },
    caption_analysis: { type: String, trim: true, required: true },
    hashtag_analysis: { type: String, trim: true, required: true },
    adaptation_for_user: { type: String, trim: true, required: true },
    freshness: { type: String, trim: true, enum: ["NEW", "TRENDING", "AGING"], required: true },
    status: { type: String, trim: true, enum: ["fresh", "saved", "used"], default: "fresh", index: true },
    source_batch_id: { type: String, trim: true, index: true }
  },
  { timestamps: true }
);

trendScoutItemSchema.index({ user: 1, niche: 1, title: 1 }, { unique: true });

export const TrendScoutItem = mongoose.model("TrendScoutItem", trendScoutItemSchema);
