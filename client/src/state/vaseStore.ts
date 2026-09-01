import { create } from "zustand";
import type { GameMessage, VasePhase } from "../game/protocol";

interface VaseState {
  phase: VasePhase;
  progress: number;
  integrity: number;
  instability: number;
  isHost: boolean;
  reset: (isHost: boolean) => void;
  applyEvent: (event: GameMessage) => void;
}

export const useVaseStore = create<VaseState>((set) => ({
  phase: "idle",
  progress: 0,
  integrity: 1,
  instability: 0,
  isHost: false,

  reset: (isHost) => set({ phase: "idle", progress: 0, integrity: 1, instability: 0, isHost }),

  applyEvent: (event) => {
    if (event.type === "vase-tick") {
      set({ phase: event.phase, progress: event.progress, integrity: event.integrity, instability: event.instability });
    } else if (event.type === "vase-result") {
      set({ phase: event.success ? "success" : "broken" });
    } else if (event.type === "vase-reset") {
      set({ phase: "idle", progress: 0, integrity: 1, instability: 0 });
    }
  },
}));
