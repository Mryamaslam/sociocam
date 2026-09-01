import { randomUUID } from "crypto";
import { recordGameResult, publicProfile, type UserRecord } from "./userStore.js";
import { audit } from "./auditLog.js";

const SESSION_TTL_MS = 10 * 60 * 1000;

interface Session {
  participantUserIds: [string, string];
  submissions: Map<string, number>;
  createdAt: number;
}

const sessions = new Map<string, Session>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}
setInterval(pruneExpired, 5 * 60 * 1000).unref();

/**
 * Called when a cooperative-game round starts (both players are in the room). This is what a
 * later /api/game-result submission gets checked against — a client can't submit a score for a
 * game that was never started, or claim to be a participant it wasn't.
 */
export function createSession(participantUserIds: [string, string]): string {
  const id = randomUUID();
  sessions.set(id, { participantUserIds, submissions: new Map(), createdAt: Date.now() });
  return id;
}

export type SubmitResult =
  | { status: "invalid" }
  | { status: "pending" }
  | { status: "mismatch" }
  | { status: "accepted"; profile: ReturnType<typeof publicProfile> };

/**
 * Neither player's client is trusted to unilaterally report a score — see the spec's own "never
 * trust client points" rule. Both participants must independently submit, and only a matching
 * pair gets persisted. A single compromised/lying client can at most cause a mismatch (result
 * discarded, logged), not grant itself or its opponent an unearned score.
 */
export function submitScore(sessionId: string, userId: string, score: number): SubmitResult {
  const session = sessions.get(sessionId);
  if (!session || !session.participantUserIds.includes(userId)) return { status: "invalid" };

  session.submissions.set(userId, score);
  const [a, b] = session.participantUserIds;
  const scoreA = session.submissions.get(a);
  const scoreB = session.submissions.get(b);
  if (scoreA === undefined || scoreB === undefined) return { status: "pending" };

  sessions.delete(sessionId);

  if (scoreA !== scoreB) {
    audit("game-result-mismatch", { sessionId, userA: a, userB: b, scoreA, scoreB });
    return { status: "mismatch" };
  }

  const userA = recordGameResult(a, scoreA);
  const userB = recordGameResult(b, scoreB);
  const me: UserRecord | undefined = userId === a ? userA : userB;
  if (!me) return { status: "invalid" };

  audit("game-result-accepted", { sessionId, userA: a, userB: b, score: scoreA });
  return { status: "accepted", profile: publicProfile(me) };
}
