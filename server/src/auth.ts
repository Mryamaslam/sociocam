import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createUser, findByUsername, publicProfile } from "./userStore.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const TOKEN_TTL = "30d";

export const AVATAR_COLORS = ["#4f9dde", "#de6f4f", "#6fde8a", "#c76fde", "#dede6f", "#de6f9e"];

export interface AuthPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AuthPayload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { username, password, displayName, avatarColor } = req.body ?? {};
  if (typeof username !== "string" || username.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (findByUsername(username)) {
    return res.status(409).json({ error: "Username already taken" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({
    username: username.trim(),
    passwordHash,
    displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : username.trim(),
    avatarColor: AVATAR_COLORS.includes(avatarColor) ? avatarColor : AVATAR_COLORS[0],
  });
  const token = signToken(user.id);
  res.json({ token, profile: publicProfile(user) });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === "string" ? findByUsername(username) : undefined;
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  const valid = await bcrypt.compare(String(password ?? ""), user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid username or password" });
  const token = signToken(user.id);
  res.json({ token, profile: publicProfile(user) });
});
