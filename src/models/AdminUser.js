import mongoose from "mongoose";

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, required: true, unique: true, lowercase: true },
    usage: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" }
  },
  { timestamps: true }
);

export const AdminUser = mongoose.model("AdminUser", adminUserSchema);
