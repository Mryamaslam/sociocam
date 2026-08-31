const API_BASE = import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000";

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  bestScore: number;
  gamesPlayed: number;
}

export interface AuthResult {
  token: string;
  profile: Profile;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export function register(input: { username: string; password: string; displayName: string; avatarColor: string }) {
  return postJson<AuthResult>("/auth/register", input);
}

export function login(input: { username: string; password: string }) {
  return postJson<AuthResult>("/auth/login", input);
}

export function submitGameResult(token: string, score: number) {
  return postJson<{ profile: Profile }>("/api/game-result", { score }, token);
}
