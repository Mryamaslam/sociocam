import multer from "multer";
import { existsSync, mkdirSync } from "fs";
import { join, dirname, normalize } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AVATAR_DIR = join(__dirname, "..", "data", "avatars");
if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });

// Generous enough for a real rigged, textured avatar (these commonly run several MB) while still
// a hard bound — not "however large a client feels like sending."
const MAX_AVATAR_BYTES = 30 * 1024 * 1024;

// Buffered in memory only long enough to validate the GLB magic bytes before writing to disk —
// never trust the client-supplied extension/mimetype alone (those are just strings the client
// chose to send, not proof of file content).
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".glb")) {
      cb(new Error("Only .glb files are accepted"));
      return;
    }
    cb(null, true);
  },
});

const GLB_MAGIC = Buffer.from("glTF", "ascii");

export interface GlbCheckResult {
  ok: boolean;
  error?: string;
}

/**
 * Real content validation, not just magic bytes — parses enough of the GLB binary container
 * structure (header + first chunk) to catch truncated/corrupted uploads server-side, rather
 * than relying solely on the client's GLTFLoader to fail gracefully later. Does not do full
 * glTF schema validation (that's what the client's own loader is for) — this is specifically
 * "is this actually a well-formed GLB container," which is cheap and catches real garbage.
 */
export function checkGlb(buffer: Buffer): GlbCheckResult {
  if (buffer.length < 20) return { ok: false, error: "File is too small to be a valid GLB" };
  if (!buffer.subarray(0, 4).equals(GLB_MAGIC)) return { ok: false, error: "Not a valid GLB file (bad magic bytes)" };

  const version = buffer.readUInt32LE(4);
  if (version !== 2) return { ok: false, error: `Unsupported glTF binary version (${version}) — expected 2` };

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    return { ok: false, error: "File is truncated or corrupted — its declared length doesn't match its actual size" };
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON" little-endian
  if (jsonChunkType !== JSON_CHUNK_TYPE) return { ok: false, error: "First chunk isn't JSON — not a valid GLB structure" };
  if (20 + jsonChunkLength > buffer.length) return { ok: false, error: "JSON chunk extends past the end of the file" };

  try {
    JSON.parse(buffer.subarray(20, 20 + jsonChunkLength).toString("utf-8"));
  } catch {
    return { ok: false, error: "GLB's embedded JSON is malformed" };
  }

  return { ok: true };
}

const SAFE_USER_ID = /^[a-zA-Z0-9_-]+$/;

/** userId always comes from the authenticated JWT (server-issued, never client-supplied text),
 * so this can't actually be attacker-controlled — the regex check is defense-in-depth, not the
 * only thing standing between this and path traversal. `normalize` + a containment check catch
 * anything the regex might have missed. */
export function avatarPathFor(userId: string): string {
  if (!SAFE_USER_ID.test(userId)) throw new Error("Invalid user id");
  const path = normalize(join(AVATAR_DIR, `${userId}.glb`));
  if (!path.startsWith(normalize(AVATAR_DIR))) throw new Error("Path escapes avatar storage directory");
  return path;
}
