import { useState } from "react";
import { login, register } from "../lib/api";
import { useAuthStore } from "../state/authStore";

const AVATAR_COLORS = ["#4f9dde", "#de6f4f", "#6fde8a", "#c76fde", "#dede6f", "#de6f9e"];

export function AuthScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await login({ username, password })
          : await register({ username, password, displayName: displayName || username, avatarColor });
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
          <>
            <input
              placeholder="Display name (shown to your friend)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div className="color-picker">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-swatch${avatarColor === color ? " color-swatch--selected" : ""}`}
                  style={{ background: color }}
                  onClick={() => setAvatarColor(color)}
                  aria-label={`Choose avatar color ${color}`}
                />
              ))}
            </div>
          </>
        )}

        <button disabled={busy || !username || !password} onClick={submit}>
          {mode === "login" ? "Log in" : "Create account"}
        </button>
        {error && <p className="lobby__error">{error}</p>}

        <button className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
