import { useState } from "react";
import { useAuthStore } from "../state/authStore";
import { logout as logoutRequest } from "../lib/api";
import { AvatarUpload } from "./AvatarUpload";

export function AccountBar() {
  const profile = useAuthStore((s) => s.profile);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  if (!profile) return null;

  const handleLogout = () => {
    // Revoke server-side first (best-effort — a network hiccup shouldn't trap the user logged
    // in), then clear local state regardless so the UI always responds immediately.
    if (token) logoutRequest(token).catch(() => {});
    logout();
  };

  return (
    <>
      <div className="account-bar">
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: profile.avatarConfig.clothingColor, display: "inline-block" }} />
        <span>{profile.displayName}</span>
        <span style={{ color: "#7fd7ce" }}>best {profile.bestScore}</span>
        <button onClick={() => setShowAvatarUpload(true)}>{profile.avatarUrl ? "Avatar" : "Get realistic avatar"}</button>
        <button onClick={handleLogout}>Log out</button>
      </div>
      {showAvatarUpload && <AvatarUpload onClose={() => setShowAvatarUpload(false)} />}
    </>
  );
}
