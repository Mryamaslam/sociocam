// Mirrors server/src/avatarUpload.ts's checks — client-side validation is purely for fast,
// specific error feedback (no round trip needed to tell someone they picked a .png). It is NOT
// a substitute for the server's own validation, which never trusts what the client claims.

export const MAX_AVATAR_BYTES = 30 * 1024 * 1024;

export interface GlbValidationResult {
  ok: boolean;
  error?: string;
}

export async function validateGlbFile(file: File): Promise<GlbValidationResult> {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    return { ok: false, error: `"${file.name}" isn't a .glb file. Export as glTF Binary (.glb), not .gltf or another format.` };
  }
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `That file is ${mb}MB — the limit is 30MB. Try a lower texture resolution when exporting.` };
  }
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const magic = String.fromCharCode(...header);
  if (magic !== "glTF") {
    return { ok: false, error: "This file doesn't look like a valid GLB — its contents don't match the format, even though it's named .glb." };
  }

  // Beyond magic bytes: check the container structure itself so a truncated/corrupted upload is
  // caught here with a clear message, rather than reaching the 3D preview where a parse failure
  // can only show as a blank canvas (three.js's GLTFLoader throws outside React's render phase,
  // so a React error boundary around the preview can't reliably catch or display it).
  const headBytes = new DataView(await file.slice(0, 20).arrayBuffer());
  if (file.size < 20) {
    return { ok: false, error: "File is too small to be a valid GLB." };
  }
  const version = headBytes.getUint32(4, true);
  if (version !== 2) {
    return { ok: false, error: `Unsupported glTF binary version (${version}) — expected 2.` };
  }
  const declaredLength = headBytes.getUint32(8, true);
  if (declaredLength !== file.size) {
    return { ok: false, error: "This file looks truncated or corrupted — its declared size doesn't match its actual size." };
  }
  const jsonChunkLength = headBytes.getUint32(12, true);
  const jsonChunkType = headBytes.getUint32(16, true);
  const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON" little-endian
  if (jsonChunkType !== JSON_CHUNK_TYPE) {
    return { ok: false, error: "This file's structure isn't a valid GLB (first chunk isn't JSON)." };
  }
  if (20 + jsonChunkLength > file.size) {
    return { ok: false, error: "This file's JSON chunk extends past the end of the file — it's corrupted." };
  }
  try {
    const jsonText = await file.slice(20, 20 + jsonChunkLength).text();
    JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "This file's embedded JSON is malformed — it's corrupted." };
  }

  return { ok: true };
}
