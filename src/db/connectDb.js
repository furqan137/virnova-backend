import mongoose from "mongoose";
import { getOrCreateAppConfig } from "../models/AppConfig.js";

export async function connectDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      "MONGODB_URI is missing. Add it to backend/.env (see .env.example). Example: mongodb://127.0.0.1:27017/virnova"
    );
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 10
  });

  await getOrCreateAppConfig();
}
