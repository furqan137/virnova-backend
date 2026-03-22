import mongoose from "mongoose";

const historyItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, trim: true, default: "" },
    hook: { type: String, trim: true, default: "" },
    script: { type: String, trim: true, default: "" },
    caption: { type: String, trim: true, default: "" },
    hashtags: [{ type: String, trim: true }]
  },
  {
    timestamps: true
  }
);

export const HistoryItem = mongoose.model("HistoryItem", historyItemSchema);
