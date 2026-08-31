import { create } from "zustand";
import type { GameMessage, GestureKind } from "../game/protocol";

export type GamePhase = "idle" | "round-active" | "round-result" | "game-over";

interface GameState {
  phase: GamePhase;
  isHost: boolean;
  roundIndex: number;
  totalRounds: number;
  gesture: GestureKind | null;
  deadlineTs: number | null;
  lastRoundSuccess: boolean | null;
  score: number;
  reset: (isHost: boolean) => void;
  applyEvent: (event: GameMessage) => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: "idle",
  isHost: false,
  roundIndex: 0,
  totalRounds: 0,
  gesture: null,
  deadlineTs: null,
  lastRoundSuccess: null,
  score: 0,

  reset: (isHost) =>
    set({
      phase: "idle",
      isHost,
      roundIndex: 0,
      totalRounds: 0,
      gesture: null,
      deadlineTs: null,
      lastRoundSuccess: null,
      score: 0,
    }),

  applyEvent: (event) => {
    if (event.type === "round-start") {
      set({
        phase: "round-active",
        roundIndex: event.roundIndex,
        totalRounds: event.totalRounds,
        gesture: event.gesture,
        deadlineTs: event.deadlineTs,
        lastRoundSuccess: null,
      });
    } else if (event.type === "round-result") {
      set((state) => ({
        phase: "round-result",
        lastRoundSuccess: event.success,
        score: state.score + (event.success ? 1 : 0),
      }));
    } else if (event.type === "game-over") {
      set({ phase: "game-over", score: event.score, totalRounds: event.totalRounds });
    } else if (event.type === "game-reset") {
      set({ phase: "idle", roundIndex: 0, gesture: null, deadlineTs: null, lastRoundSuccess: null, score: 0 });
    }
  },
}));
