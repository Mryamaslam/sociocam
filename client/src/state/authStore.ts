import { create } from "zustand";
import type { Profile } from "../lib/api";

const STORAGE_KEY = "camera-world-session";

interface StoredSession {
  token: string;
  profile: Profile;
}

function loadStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  profile: Profile | null;
  setSession: (session: StoredSession) => void;
  updateProfile: (profile: Profile) => void;
  logout: () => void;
}

const initial = loadStored();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: initial?.token ?? null,
  profile: initial?.profile ?? null,

  setSession: ({ token, profile }) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, profile }));
    set({ token, profile });
  },

  updateProfile: (profile) => {
    const token = get().token;
    if (token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, profile }));
    set({ profile });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, profile: null });
  },
}));
