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
    <div className="auth-screen">
      <div className="auth-hero">
        <p className="auth-hero__eyebrow">Camera-driven multiplayer</p>
        <h1 className="auth-hero__title">Camera Social World</h1>
        <p className="auth-hero__tagline">
          Step into a private room as a live, expressive 3D version of yourself — every smile,
          raised hand, and head turn mirrored in real time, driven entirely by your camera.
        </p>

        <div className="auth-visual" aria-hidden="true">
          <span className="auth-visual__avatar auth-visual__avatar--a" />
          <span className="auth-visual__link">
            <span className="auth-visual__pulse" />
          </span>
          <span className="auth-visual__avatar auth-visual__avatar--b" />
        </div>

        <ul className="auth-hero__features">
          <li>
            <span className="auth-hero__feature-icon" data-icon="expression" />
            <div>
              <strong>Real expressions, live</strong>
              <span>Face, hand, and body tracking runs on-device and mirrors onto your avatar instantly.</span>
            </div>
          </li>
          <li>
            <span className="auth-hero__feature-icon" data-icon="avatar" />
            <div>
              <strong>Actually looks like you</strong>
              <span>Start with a customizable avatar, or upload a realistic one generated from your own photo.</span>
            </div>
          </li>
          <li>
            <span className="auth-hero__feature-icon" data-icon="privacy" />
            <div>
              <strong>Camera-private by design</strong>
              <span>Nothing but small tracking numbers ever leaves your browser — never a frame of video.</span>
            </div>
          </li>
        </ul>
      </div>

      <div className="auth-panel">
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
    </div>
  );
}
