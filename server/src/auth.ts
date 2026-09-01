import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createUser, findByUsername, publicProfile } from "./userStore.js";
import { env } from "./env.js";
import { validate, registerSchema, loginSchema } from "./validation.js";
import { audit } from "./auditLog.js";
import { isRevoked, revokeToken } from "./tokenRevocation.js";

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days — see README "Known gaps" for why this isn't a
// separate short-lived-access + refresh-token pair: a revocable jti gives the meaningful
// property (logout actually invalidates the token) without a second token subsystem's worth of
// surface area for a Phase A validation build.

export interface AuthPayload {
  sub: string;
  jti: string;
  exp: number;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId, jti: randomUUID() }, env.jwtSecret, { expiresIn: TOKEN_TTL_SEC });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (payload.jti && isRevoked(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = validate(registerSchema, req.body);
  if (!parsed.ok) {
    audit("register-rejected", { reason: parsed.error, ip: req.ip });
    return res.status(400).json({ error: parsed.error });
  }
  const { username, password, displayName, avatarConfig } = parsed.data;
  if (findByUsername(username)) {
    audit("register-rejected", { reason: "username taken", ip: req.ip });
    return res.status(409).json({ error: "Username already taken" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({
    username,
    passwordHash,
    displayName: displayName ?? username,
    avatarConfig,
  });
  audit("register", { userId: user.id, ip: req.ip });
  const token = signToken(user.id);
  res.json({ token, profile: publicProfile(user) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = validate(loginSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { username, password } = parsed.data;
  const user = findByUsername(username);
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    audit("login-failed", { username, ip: req.ip });
    return res.status(401).json({ error: "Invalid username or password" });
  }
  audit("login-success", { userId: user.id, ip: req.ip });
  const token = signToken(user.id);
  res.json({ token, profile: publicProfile(user) });
});

authRouter.post("/logout", (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    revokeToken(payload.jti, payload.exp * 1000);
    audit("logout", { userId: payload.sub });
  }
  res.json({ ok: true });
});
