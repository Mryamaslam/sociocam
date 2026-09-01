import type { AvatarConfig } from "../avatar/avatarOptions";

// Empty string = same-origin, relative requests (routed to the signaling server by the
// dev server's proxy — see vite.config.ts). Only set VITE_SIGNALING_URL when the server
// truly lives on a different host than the client (e.g. a real production deployment).
const API_BASE = import.meta.env.VITE_SIGNALING_URL ?? "";

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  /** Relative path to a realistic rigged GLB avatar the user uploaded, or null for the procedural fallback. */
  avatarUrl: string | null;
  bestScore: number;
  gamesPlayed: number;
}

/** Resolves a profile's avatarUrl (a relative path from the server) against the API base, for
 * passing straight to a GLTFLoader/useGLTF. */
export function resolveAvatarUrl(avatarUrl: string): string {
  return `${API_BASE}${avatarUrl}`;
}

export interface AuthResult {
  token: string;
  profile: Profile;
}

async function requestJson<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  // A free-tier host that's asleep can have its gateway return an HTML timeout/error page instead
  // of proxying through to the app — res.json() would throw a raw "Unexpected token '<'" in that
  // case, which reads as a broken app rather than what it actually is: the backend waking up.
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Couldn't reach the server — it may still be waking up. Please try again in a moment.");
  }
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export function register(input: { username: string; password: string; displayName: string; avatarConfig: AvatarConfig }) {
  return requestJson<AuthResult>("POST", "/auth/register", input);
}

export function login(input: { username: string; password: string }) {
  return requestJson<AuthResult>("POST", "/auth/login", input);
}

// The server won't accept a score on one client's say-so — it holds submissions until BOTH
// players in the session report, and only persists a matching pair. See gameSessions.ts.
// "pending" means this client's own submission was recorded but the other player hasn't
// reported yet; the profile update arrives once they do (their own submitGameResult call
// triggers the accept on the server, but only the submitting request gets the response —
// each client calls this itself, so each gets its own "accepted" response in turn).
export function submitGameResult(token: string, sessionId: string, score: number) {
  return requestJson<{ status: "pending" } | { profile: Profile }>("POST", "/api/game-result", { sessionId, score }, token);
}

export function updateProfile(token: string, patch: { displayName?: string; avatarConfig?: Partial<AvatarConfig> }) {
  return requestJson<{ profile: Profile }>("PATCH", "/api/profile", patch, token);
}

export function logout(token: string) {
  return requestJson<{ ok: boolean }>("POST", "/auth/logout", {}, token);
}

/** XMLHttpRequest, not fetch — fetch has no upload-progress event, and a multi-MB avatar file
 * genuinely needs one (the spec calls for a real loading/progress state, not a spinner that
 * means nothing). */
export function uploadAvatar(token: string, file: File, onProgress?: (fraction: number) => void): Promise<{ profile: Profile }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("avatar", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/avatar`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: any;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Couldn't reach the server — it may still be waking up. Please try again in a moment."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export function deleteAvatar(token: string) {
  return requestJson<{ profile: Profile }>("DELETE", "/api/avatar", undefined, token);
}
