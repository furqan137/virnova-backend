import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    plan: { type: String, enum: ["free", "premium"], default: "free" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    usage: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
