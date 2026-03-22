import mongoose from "mongoose";

const analysisResultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    niche: { type: String, required: true, trim: true },
    links: [{ type: String, trim: true }],
    output: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

export const AnalysisResult = mongoose.model("AnalysisResult", analysisResultSchema);
