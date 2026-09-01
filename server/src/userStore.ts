import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sanitizeAvatarConfig, type AvatarConfig } from "./avatarOptions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "users.json");

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  /** Set once the user uploads a realistic rigged avatar (see avatarUpload.ts). Null = still
   * using the procedural fallback avatar. A relative path the client resolves against its API
   * base, e.g. "/avatars/u_123.glb" — never an absolute URL to some other origin. */
  avatarUrl: string | null;
  bestScore: number;
  gamesPlayed: number;
  createdAt: number;
}

interface DbShape {
  users: UserRecord[];
}

function load(): DbShape {
  if (!existsSync(DATA_FILE)) return { users: [] };
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { users: [] };
  }
}

function save(db: DbShape): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

let db = load();

export function findByUsername(username: string): UserRecord | undefined {
  return db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function findById(id: string): UserRecord | undefined {
  return db.users.find((u) => u.id === id);
}

export function createUser(input: {
  username: string;
  passwordHash: string;
  displayName: string;
  avatarConfig: Partial<AvatarConfig> | undefined;
}): UserRecord {
  const user: UserRecord = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: input.username,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    avatarConfig: sanitizeAvatarConfig(input.avatarConfig),
    avatarUrl: null,
    bestScore: 0,
    gamesPlayed: 0,
    createdAt: Date.now(),
  };
  db.users.push(user);
  save(db);
  return user;
}

export function recordGameResult(userId: string, score: number): UserRecord | undefined {
  const user = findById(userId);
  if (!user) return undefined;
  user.gamesPlayed += 1;
  user.bestScore = Math.max(user.bestScore, score);
  save(db);
  return user;
}

export function updateProfile(userId: string, input: { displayName?: string; avatarConfig?: Partial<AvatarConfig> }): UserRecord | undefined {
  const user = findById(userId);
  if (!user) return undefined;
  if (input.displayName && input.displayName.trim()) user.displayName = input.displayName.trim().slice(0, 40);
  if (input.avatarConfig) user.avatarConfig = sanitizeAvatarConfig({ ...user.avatarConfig, ...input.avatarConfig });
  save(db);
  return user;
}

export function setAvatarUrl(userId: string, avatarUrl: string | null): UserRecord | undefined {
  const user = findById(userId);
  if (!user) return undefined;
  user.avatarUrl = avatarUrl;
  save(db);
  return user;
}

export function publicProfile(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarConfig: user.avatarConfig,
    avatarUrl: user.avatarUrl,
    bestScore: user.bestScore,
    gamesPlayed: user.gamesPlayed,
  };
}
