import mongoose from "mongoose";

/** Singleton-style app config (e.g. global API limit for admin). */
const appConfigSchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  apiLimitPerUser: { type: Number, default: 500, min: 1 }
});

export const AppConfig = mongoose.model("AppConfig", appConfigSchema);

export async function getOrCreateAppConfig() {
  await AppConfig.updateOne(
    { _id: "global" },
    { $setOnInsert: { _id: "global", apiLimitPerUser: 500 } },
    { upsert: true }
  );
  return AppConfig.findById("global").lean();
}
