import { Router } from "express";
import mongoose from "mongoose";
import { HistoryItem } from "../models/HistoryItem.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const items = await HistoryItem.find({ user: userId }).sort({ createdAt: -1 }).lean();
    const normalized = items.map((item) => ({ ...item, id: item._id.toString() }));
    res.json({ items: normalized });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[history] GET failed:", error.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const created = await HistoryItem.create({
      user: userId,
      title: body.title,
      hook: body.hook,
      script: body.script,
      caption: body.caption,
      hashtags: body.hashtags
    });
    res.status(201).json({ ...created.toObject(), id: created._id.toString() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[history] POST failed:", error.message);
    res.status(400).json({ error: "Failed to create history item" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const updated = await HistoryItem.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      req.body || {},
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      return res.status(404).json({ error: "Item not found" });
    }

    return res.json({ ...updated.toObject(), id: updated._id.toString() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[history] PUT failed:", error.message);
    return res.status(400).json({ error: "Failed to update history item" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const deleted = await HistoryItem.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!deleted) {
      return res.status(404).json({ error: "Item not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[history] DELETE failed:", error.message);
    return res.status(400).json({ error: "Failed to delete history item" });
  }
});

export default router;
