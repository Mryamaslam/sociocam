const isProduction = process.env.NODE_ENV === "production";

const DEV_ONLY_JWT_SECRET = "dev-secret-change-in-production";

/**
 * Never falls back to a guessable secret in production. The dev fallback exists purely so
 * `npm run dev` works out of the box on a fresh clone — it must never be reachable once
 * NODE_ENV=production, or every token this server issues would be forgeable by anyone who
 * read this file on GitHub.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.trim().length >= 32) return fromEnv;
  if (isProduction) {
    throw new Error(
      "JWT_SECRET env var must be set (32+ chars) in production. Refusing to start with a guessable default — " +
        "generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  if (fromEnv) {
    console.warn("JWT_SECRET is set but shorter than 32 chars — fine for local dev, not for production.");
    return fromEnv;
  }
  console.warn("JWT_SECRET not set — using a dev-only default. Set a real one before deploying.");
  return DEV_ONLY_JWT_SECRET;
}

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: resolveJwtSecret(),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
