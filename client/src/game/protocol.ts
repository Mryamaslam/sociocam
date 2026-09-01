import type { TrackingFrame } from "../types/tracking";

export type GestureKind = "smile" | "raise-hand" | "open-palms" | "hold-hands";

export const GESTURE_SEQUENCE: GestureKind[] = ["smile", "raise-hand", "open-palms", "raise-hand", "hold-hands"];

export const GESTURE_LABELS: Record<GestureKind, string> = {
  smile: "Both: Smile!",
  "raise-hand": "Both: Raise a hand!",
  "open-palms": "Both: Open your palms wide!",
  "hold-hands": "Both: Reach out and hold hands!",
};

export type VasePhase = "idle" | "carrying" | "success" | "broken";

export type GameMessage =
  | { type: "round-start"; roundIndex: number; totalRounds: number; gesture: GestureKind; deadlineTs: number }
  | { type: "round-result"; roundIndex: number; success: boolean }
  | { type: "game-over"; score: number; totalRounds: number }
  | { type: "game-reset" }
  | { type: "vase-tick"; phase: VasePhase; progress: number; integrity: number; instability: number }
  | { type: "vase-result"; success: boolean }
  | { type: "vase-reset" };

export type DataChannelMessage = { kind: "tracking"; frame: TrackingFrame } | { kind: "game"; event: GameMessage };
