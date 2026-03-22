import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "virnova-dev-secret";

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name || "",
    email: user.email || "",
    plan: user.plan || "free",
    status: user.status || "Active"
  };
}

router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(401).json({ error: "Invalid user id in token." });
    }
    const userDoc = await User.findById(req.user.id).lean();
    if (!userDoc) {
      return res.status(401).json({ error: "User no longer exists." });
    }
    if (userDoc.status === "Inactive") {
      return res.status(403).json({ error: "Account is inactive." });
    }
    return res.json({ user: sanitizeUser(userDoc) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[auth] /me failed:", error.message);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, plan } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const created = await User.create({
      name: String(name || "").trim(),
      email: normalizedEmail,
      passwordHash,
      plan: plan === "premium" ? "premium" : "free",
      status: "Active"
    });

    const user = sanitizeUser(created);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d"
    });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }
    // eslint-disable-next-line no-console
    console.error("[auth] signup error:", error.message);
    return res.status(500).json({ error: "Signup failed. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userDoc = await User.findOne({ email: normalizedEmail });
    if (!userDoc) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (userDoc.status === "Inactive") {
      return res.status(403).json({ error: "User account is inactive" });
    }

    const valid = await bcrypt.compare(String(password), userDoc.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = sanitizeUser(userDoc);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d"
    });
    return res.json({ token, user });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[auth] login error:", error.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

export default router;
