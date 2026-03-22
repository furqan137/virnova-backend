import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserSettings } from "../models/UserSettings.js";
import { HistoryItem } from "../models/HistoryItem.js";
import { AnalysisResult } from "../models/AnalysisResult.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

const defaultPreferences = {
  emailNotifications: true,
  personalizedSuggestions: true,
  weeklyReport: false,
  darkMode: true
};

function stripInternal(doc) {
  if (!doc) return doc;
  const o = { ...doc };
  delete o.passwordHash;
  delete o.__v;
  if (o.user && typeof o.user === "object" && o.user.toString) {
    o.user = o.user.toString();
  }
  return o;
}

async function getOrCreateSettingsForUser(userId) {
  const oid = new mongoose.Types.ObjectId(userId);
  const user = await User.findById(oid).lean();
  const row = await UserSettings.findOneAndUpdate(
    { user: oid },
    {
      $setOnInsert: {
        user: oid,
        name: user?.name || "",
        email: user?.email || "",
        username: user?.email ? String(user.email).split("@")[0] : "",
        defaultNiche: "fitness",
        defaultAudience: "beginners",
        preferences: { ...defaultPreferences }
      }
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return stripInternal(row);
}

/**
 * User collection is source of truth for name + email (signup/login).
 * Merge into settings row for API response and keep UserSettings in sync.
 */
async function getProfileForClient(userId) {
  const oid = new mongoose.Types.ObjectId(userId);
  const user = await User.findById(oid).lean();
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const settings = await getOrCreateSettingsForUser(userId);
  const name = (user.name != null && String(user.name).trim() !== "" ? user.name : settings.name) || "";
  const email = user.email || settings.email || "";
  const username =
    settings.username && String(settings.username).trim() !== ""
      ? settings.username
      : email
        ? String(email).split("@")[0]
        : "";

  const drift = name !== (settings.name || "") || email !== (settings.email || "");
  if (drift) {
    await UserSettings.updateOne(
      { user: oid },
      { $set: { name, email, username: username || settings.username } }
    );
  }

  return {
    ...settings,
    name,
    email,
    username,
    plan: user.plan || "free",
    status: user.status || "Active"
  };
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const profile = await getProfileForClient(req.user.id);
    return res.json(stripInternal(profile));
  } catch (error) {
    const status = error.status || 500;
    // eslint-disable-next-line no-console
    console.error("[settings] GET failed:", error.message);
    return res.status(status).json({ error: status === 404 ? "User not found" : "Failed to fetch settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body || {};
    const userId = req.user.id;
    const oid = new mongoose.Types.ObjectId(userId);

    await getOrCreateSettingsForUser(userId);

    const payload = {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      email: body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined,
      username: body.username !== undefined ? String(body.username).trim() : undefined,
      defaultNiche: body.defaultNiche !== undefined ? String(body.defaultNiche).trim() : undefined,
      defaultAudience: body.defaultAudience !== undefined ? String(body.defaultAudience).trim() : undefined,
      preferences: body.preferences
        ? {
            ...defaultPreferences,
            ...body.preferences
          }
        : undefined
    };

    const update = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined)
    );

    const settings = await UserSettings.findOneAndUpdate({ user: oid }, update, {
      new: true,
      runValidators: true
    }).lean();

    if (update.email !== undefined || update.name !== undefined) {
      try {
        await User.findByIdAndUpdate(
          oid,
          {
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.email !== undefined ? { email: update.email } : {})
          },
          { runValidators: true }
        );
      } catch (userErr) {
        if (userErr?.code === 11000) {
          return res.status(400).json({ error: "That email is already in use." });
        }
        throw userErr;
      }
    }

    const profile = await getProfileForClient(userId);
    return res.json(stripInternal(profile));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: "That email is already in use." });
    }
    // eslint-disable-next-line no-console
    console.error("[settings] PUT failed:", error.message);
    return res.status(400).json({ error: "Failed to update settings" });
  }
});

router.put("/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const userDoc = await User.findById(req.user.id);
    if (!userDoc) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(String(currentPassword), userDoc.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    userDoc.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await userDoc.save();
    return res.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[settings] password failed:", error.message);
    return res.status(500).json({ error: "Failed to update password" });
  }
});

router.delete("/account", async (req, res) => {
  try {
    const oid = new mongoose.Types.ObjectId(req.user.id);
    await Promise.all([
      UserSettings.deleteMany({ user: oid }),
      HistoryItem.deleteMany({ user: oid }),
      AnalysisResult.deleteMany({ user: oid }),
      User.findByIdAndDelete(oid)
    ]);
    return res.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[settings] delete account failed:", error.message);
    return res.status(500).json({ error: "Failed to delete account data" });
  }
});

export default router;
