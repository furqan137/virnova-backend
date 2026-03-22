import mongoose from "mongoose";

const preferencesSchema = new mongoose.Schema(
  {
    emailNotifications: { type: Boolean, default: true },
    personalizedSuggestions: { type: Boolean, default: true },
    weeklyReport: { type: Boolean, default: false },
    darkMode: { type: Boolean, default: true }
  },
  { _id: false }
);

const userSettingsSchema = new mongoose.Schema(
  {
    /** Logged-in user this document belongs to (one doc per user). */
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    /** Legacy global row (deprecated; prefer AppConfig for limits). */
    key: { type: String, trim: true, sparse: true },
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    username: { type: String, trim: true, default: "" },
    defaultNiche: { type: String, trim: true, default: "fitness" },
    defaultAudience: { type: String, trim: true, default: "beginners" },
    preferences: { type: preferencesSchema, default: () => ({}) }
  },
  {
    timestamps: true
  }
);

export const UserSettings = mongoose.model("UserSettings", userSettingsSchema);
