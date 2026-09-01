// In-memory revocation list keyed by JWT id (jti). Lets a logout actually mean something —
// without this, a JWT is valid until it naturally expires no matter what the user does.
// Single-process/in-memory is a deliberate Phase A scope call (see README "Known gaps"); a
// multi-instance deployment would need this in shared storage (Redis, etc.) instead.

const revoked = new Map<string, number>(); // jti -> expiresAtMs (so we know when it's safe to prune)

export function revokeToken(jti: string, expiresAtMs: number): void {
  revoked.set(jti, expiresAtMs);
}

export function isRevoked(jti: string): boolean {
  return revoked.has(jti);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [jti, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(jti);
  }
}

setInterval(pruneExpired, 10 * 60 * 1000).unref();
