import "dotenv/config";
import express from "express";
import cors from "cors";
import contentRoutes from "./routes/content.js";
import trendsRoutes from "./routes/trends.js";
import ideasRoutes from "./routes/ideas.js";
import generateRoute from "./routes/generate.js";
import hooksRoutes from "./routes/hooks.js";
import historyRoutes from "./routes/history.js";
import settingsRoutes from "./routes/settings.js";
import analyzeRoutes from "./routes/analyze.js";
import scriptRoutes from "./routes/script.js";
import captionRoutes from "./routes/caption.js";
import contentIdeasRoutes from "./routes/contentIdeas.js";
import viralContentRoutes from "./routes/viralContent.js";
import viralGeneratorRoutes from "./routes/viralGenerator.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import trendScoutRoutes from "./routes/trendScout.js";
import { connectDb } from "./db/connectDb.js";

const app = express();
const primaryPort = Number(process.env.PORT || 5000);
const fallbackPort = 5050;

const DEFAULT_CORS_ORIGINS = [
  "https://virnova-frontend.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
];

function logProductionEnvHints() {
  if (!process.env.WAVESPEED_API_KEY) {
    // eslint-disable-next-line no-console
    console.error("[env] Missing WAVESPEED_API_KEY — AI generation will fail.");
  }
  const mongo = (process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
  if (!mongo) {
    // eslint-disable-next-line no-console
    console.error("[env] Missing MONGODB_URI / MONGO_URI — auth and saved content will not work.");
  }
  if (process.env.OPENAI_API_KEY && !process.env.WAVESPEED_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn("[env] OPENAI_API_KEY is set but this app uses WAVESPEED_API_KEY for LLM calls.");
  }
  const secret = process.env.JWT_SECRET || "";
  if (!secret || secret === "virnova-dev-secret") {
    // eslint-disable-next-line no-console
    console.warn("[env] JWT_SECRET is missing or using dev default — rotate for production.");
  }
}

/**
 * CORS for browser clients (Vercel + local dev). Set CORS_ORIGIN to add more origins (comma-separated).
 * Set CORS_ALLOW_ALL=1 only for temporary debugging.
 */
function buildCorsOptions() {
  const extra = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = [...new Set([...DEFAULT_CORS_ORIGINS, ...extra])];

  if (process.env.CORS_ALLOW_ALL === "1" || process.env.CORS_ALLOW_ALL === "true") {
    // eslint-disable-next-line no-console
    console.warn("[cors] CORS_ALLOW_ALL is enabled — not recommended for production.");
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowList.includes(origin)) {
        return callback(null, true);
      }
      try {
        const { hostname } = new URL(origin);
        if (hostname.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch {
        return callback(null, false);
      }
      // eslint-disable-next-line no-console
      console.warn("[cors] Blocked origin:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };
}

logProductionEnvHints();

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "virnova-backend" });
});

app.use("/api/content", contentRoutes);
app.use("/api/trends", trendsRoutes);
app.use("/api/ideas", ideasRoutes);
app.use("/api/hooks", hooksRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/analyze", analyzeRoutes);
app.use("/api", scriptRoutes);
app.use("/api", captionRoutes);
app.use("/api", contentIdeasRoutes);
app.use("/api/viral-content", viralContentRoutes);
app.use("/api", viralGeneratorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/trend-scout", trendScoutRoutes);
app.use("/", generateRoute);
app.use("/api/ai", generateRoute);

async function start() {
  const mongoOptional =
    process.env.MONGO_OPTIONAL === "true" || process.env.MONGO_OPTIONAL === "1";

  try {
    await connectDb();
    // eslint-disable-next-line no-console
    console.log("MongoDB connected");
  } catch (error) {
    if (mongoOptional) {
      // eslint-disable-next-line no-console
      console.warn(`MongoDB unavailable, continuing without DB: ${error.message}`);
    } else {
      // eslint-disable-next-line no-console
      console.error("MongoDB connection failed:", error.message);
      // eslint-disable-next-line no-console
      console.error(
        "Fix MONGODB_URI in backend/.env or start MongoDB locally. For dev without DB, set MONGO_OPTIONAL=1 in .env"
      );
      process.exit(1);
    }
  }

  function listenOnPort(portToUse, hasRetried = false) {
    const server = app.listen(portToUse, () => {
      // eslint-disable-next-line no-console
      console.log(`Virnova backend running on http://localhost:${portToUse}`);
    });

    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE" && !hasRetried) {
        // eslint-disable-next-line no-console
        console.warn(`Port ${portToUse} is busy. Falling back to http://localhost:${fallbackPort}`);
        listenOnPort(fallbackPort, true);
        return;
      }
      // eslint-disable-next-line no-console
      console.error("Backend server error:", error.message || error);
      process.exit(1);
    });
  }

  listenOnPort(primaryPort);
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});
