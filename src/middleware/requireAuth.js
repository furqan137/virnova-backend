import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "virnova-dev-secret";

/**
 * Requires `Authorization: Bearer <token>`. Sets `req.user = { id, email }`.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = payload.sub;
    if (!id || typeof id !== "string") {
      return res.status(401).json({ error: "Invalid token payload." });
    }
    req.user = {
      id,
      email: typeof payload.email === "string" ? payload.email : ""
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }
}
