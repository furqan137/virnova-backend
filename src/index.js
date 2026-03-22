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
import { connectDb } from "./db/connectDb.js";

const app = express();
const primaryPort = Number(process.env.PORT || 5000);
const fallbackPort = 5050;

/** Comma-separated origins for browser clients (e.g. https://your-app.vercel.app). Empty = allow all (fine for many APIs). */
function buildCorsOptions() {
  const raw = process.env.CORS_ORIGIN || "";
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return {};
  }
  return {
    origin: origins
  };
}

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
app.use("/", generateRoute);

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
