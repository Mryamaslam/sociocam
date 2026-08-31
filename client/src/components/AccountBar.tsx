import { useAuthStore } from "../state/authStore";

export function AccountBar() {
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  if (!profile) return null;

  return (
    <div className="account-bar">
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: profile.avatarColor, display: "inline-block" }} />
      <span>{profile.displayName}</span>
      <span style={{ color: "#7fd7ce" }}>best {profile.bestScore}</span>
      <button onClick={logout}>Log out</button>
    </div>
  );
}
