import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "users.json");

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatarColor: string;
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
  avatarColor: string;
}): UserRecord {
  const user: UserRecord = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: input.username,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    avatarColor: input.avatarColor,
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

export function publicProfile(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    bestScore: user.bestScore,
    gamesPlayed: user.gamesPlayed,
  };
}
