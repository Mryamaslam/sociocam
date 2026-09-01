import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "..", "data");
const LOG_FILE = join(LOG_DIR, "audit.log");

export type AuditEvent =
  | "register"
  | "register-rejected"
  | "login-success"
  | "login-failed"
  | "logout"
  | "token-refresh"
  | "token-refresh-rejected"
  | "rate-limited"
  | "socket-auth-rejected"
  | "connection-limit-rejected"
  | "invalid-message"
  | "game-result-accepted"
  | "game-result-mismatch"
  | "game-result-rejected"
  | "avatar-uploaded";

/**
 * Append-only security event log — who did what, when, from where. Not general app logging;
 * only events with security/audit relevance (auth, rate limits, rejected input, score
 * submissions). Writes to a local file so it survives restarts; swap for a real log
 * aggregator (e.g. shipped to a SIEM) before this handles real user data at scale.
 */
export function audit(event: AuditEvent, details: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...details });
  console.log(`[audit] ${line}`);
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch (err) {
    console.error("Failed to write audit log", err);
  }
}
