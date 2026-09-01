import { useState } from "react";
import { login, register } from "../lib/api";
import { useAuthStore } from "../state/authStore";
import { AvatarCustomizer } from "./AvatarCustomizer";
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig } from "../avatar/avatarOptions";

export function AuthScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await login({ username, password })
          : await register({ username, password, displayName: displayName || username, avatarConfig });
      setSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby">
      <h1>Camera Social World</h1>
      <p className="lobby__subtitle">{mode === "login" ? "Welcome back." : "Create your account."}</p>

      <div className="auth-form">
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {mode === "register" && (
          <input
            placeholder="Display name (shown to your friend)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}

        {mode === "login" && (
          <button disabled={busy || !username || !password} onClick={submit}>
            Log in
          </button>
        )}
        {error && <p className="lobby__error">{error}</p>}

        <button className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>

      {mode === "register" && (
        <>
          <AvatarCustomizer value={avatarConfig} onChange={setAvatarConfig} />
          <button disabled={busy || !username || !password} onClick={submit}>
            Create account
          </button>
          {error && <p className="lobby__error">{error}</p>}
        </>
      )}
    </div>
  );
}
