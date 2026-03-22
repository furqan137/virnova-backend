import { Router } from "express";
import { HistoryItem } from "../models/HistoryItem.js";
import { AnalysisResult } from "../models/AnalysisResult.js";
import { UserSettings } from "../models/UserSettings.js";
import { AppConfig, getOrCreateAppConfig } from "../models/AppConfig.js";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";

const router = Router();

function sanitizeManagedUser(userDoc) {
  return {
    id: userDoc._id.toString(),
    name: userDoc.name || "",
    email: userDoc.email || "",
    usage: Number(userDoc.usage || 0),
    status: userDoc.status || "Active",
    plan: userDoc.plan || "free",
    createdAt: userDoc.createdAt
  };
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

async function getUsageSummary() {
  const [historyCount, analysisCount] = await Promise.all([
    HistoryItem.countDocuments(),
    AnalysisResult.countDocuments()
  ]);

  const todayStart = startOfDay();
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [todayHistory, todayAnalysis] = await Promise.all([
    HistoryItem.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd }
    }),
    AnalysisResult.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd }
    })
  ]);

  const apiRequestsToday = todayHistory + todayAnalysis;
  const totalApiCalls = historyCount + analysisCount;

  const last7Start = new Date(todayStart);
  last7Start.setDate(last7Start.getDate() - 6);
  const [historyInWeek, analysisInWeek] = await Promise.all([
    HistoryItem.find({ createdAt: { $gte: last7Start } }).select("createdAt").lean(),
    AnalysisResult.find({ createdAt: { $gte: last7Start } }).select("createdAt").lean()
  ]);

  const dayBuckets = new Map();
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(last7Start);
    day.setDate(last7Start.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    dayBuckets.set(key, { day: formatDayLabel(day), requests: 0 });
  }

  [...historyInWeek, ...analysisInWeek].forEach((item) => {
    const key = new Date(item.createdAt).toISOString().slice(0, 10);
    const entry = dayBuckets.get(key);
    if (entry) entry.requests += 1;
  });

  const weeklyUsage = Array.from(dayBuckets.values());

  return {
    totalApiCalls,
    apiRequestsToday,
    weeklyUsage
  };
}

router.get("/dashboard", async (_req, res) => {
  try {
    const [usageSummary, usersCount, recentHistory] = await Promise.all([
      getUsageSummary(),
      User.countDocuments(),
      HistoryItem.find().sort({ createdAt: -1 }).limit(8).lean()
    ]);

    const totalGenerations = usageSummary.totalApiCalls;
    const totalUsers = usersCount;

    const recentActivity = recentHistory.map((item) => ({
      script: item.title || "Generated content",
      result: item.script || item.caption || item.hook || "Generated output",
      date: new Date(item.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    }));

    return res.json({
      kpis: {
        totalUsers,
        totalGenerations,
        apiRequestsToday: usageSummary.apiRequestsToday
      },
      weeklyUsage: usageSummary.weeklyUsage,
      recentActivity
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load admin dashboard metrics" });
  }
});

router.get("/api-usage", async (_req, res) => {
  try {
    const [usageSummary, appConfig, users] = await Promise.all([
      getUsageSummary(),
      getOrCreateAppConfig(),
      User.find().sort({ usage: -1 }).limit(7).lean()
    ]);

    const userSeries = users.map((user) => Number(user.usage || 0));
    while (userSeries.length < 7) userSeries.push(0);

    return res.json({
      metrics: {
        totalApiCalls: usageSummary.totalApiCalls,
        estimatedCost: Number((usageSummary.totalApiCalls * 0.004).toFixed(2)),
        requestsToday: usageSummary.apiRequestsToday
      },
      weeklyUsage: usageSummary.weeklyUsage,
      maxPerUserSeries: userSeries.slice(0, 7),
      limit: Number(appConfig?.apiLimitPerUser || 500)
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load API usage metrics" });
  }
});

router.put("/api-usage/limit", async (req, res) => {
  try {
    const rawLimit = Number(req.body?.limit);
    if (!Number.isFinite(rawLimit) || rawLimit < 1) {
      return res.status(400).json({ error: "limit must be a positive number" });
    }

    const updated = await AppConfig.findOneAndUpdate(
      { _id: "global" },
      { apiLimitPerUser: Math.round(rawLimit) },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ limit: Number(updated?.apiLimitPerUser || Math.round(rawLimit)) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update API limit" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const query = String(req.query?.q || "").trim();
    const filter = query
      ? {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } }
          ]
        }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    const items = users.map((user) => sanitizeManagedUser(user));
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { name, email, usage, status } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "name and email are required" });
    }
    const created = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      usage: Number(usage || 0),
      status: status === "Inactive" ? "Inactive" : "Active",
      plan: "free",
      passwordHash: await bcrypt.hash("Virnova@123", 10)
    });
    return res.status(201).json(sanitizeManagedUser(created.toObject()));
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 400 : 500).json({
      error: duplicate ? "User with this email already exists" : "Failed to create user"
    });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const { name, email, usage, status } = req.body || {};
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(email !== undefined ? { email: String(email).trim().toLowerCase() } : {}),
        ...(usage !== undefined ? { usage: Number(usage) } : {}),
        ...(status !== undefined ? { status: status === "Inactive" ? "Inactive" : "Active" } : {}),
        ...(req.body?.plan !== undefined ? { plan: req.body.plan === "premium" ? "premium" : "free" } : {})
      },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "User not found" });
    return res.json(sanitizeManagedUser(updated.toObject()));
  } catch (error) {
    return res.status(400).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "User not found" });
    const oid = deleted._id;
    await Promise.all([
      UserSettings.deleteMany({ user: oid }),
      HistoryItem.deleteMany({ user: oid }),
      AnalysisResult.deleteMany({ user: oid })
    ]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: "Failed to delete user" });
  }
});

export default router;
