import { useRoomStore } from "../state/roomStore";
import { useVaseStore } from "../state/vaseStore";
import type { GameMessage } from "./protocol";
import type { TrackingPeerConnection } from "../lib/webrtc/peerConnection";

const TICK_MS = 100;

// Below this energy-difference, players read as "in sync"; above it, fully desynced. Matches
// the spec's own example numbers (0.02 diff = stable, 0.55 diff = unstable).
const DIFF_STABLE = 0.05;
const DIFF_UNSTABLE = 0.4;

const INTEGRITY_DECAY_PER_SEC = 0.35; // at full instability, the vase loses this much integrity per second
const INTEGRITY_RECOVER_PER_SEC = 0.18; // at full stability, it heals this much per second
const MIN_EFFORT = 0.12; // average energy must clear this for progress to accrue — standing still can't trivially "win"
const PROGRESS_RATE_PER_SEC = 0.11; // at full stability + sufficient effort, ~9s to deliver the vase

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Host-authoritative "Vase" physics loop: reads both players' movement-energy signals every
 * tick, derives instability from how far apart they are, and evolves a persistent integrity/
 * progress pair from that. Broadcasts the resulting state to the joiner every tick — same
 * trust model as GameEngine (Mirror Moment): the host computes, both clients render.
 */
export class VaseEngine {
  private peer: TrackingPeerConnection;
  private isHost: boolean;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTs: number | null = null;
  private progress = 0;
  private integrity = 1;
  private disposed = false;

  constructor(peer: TrackingPeerConnection, isHost: boolean) {
    this.peer = peer;
    this.isHost = isHost;
    useVaseStore.getState().reset(isHost);
  }

  start(): void {
    if (!this.isHost || this.disposed) return;
    this.progress = 0;
    this.integrity = 1;
    this.lastTickTs = null;
    this.broadcast({ type: "vase-tick", phase: "carrying", progress: 0, integrity: 1, instability: 0 });
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  private broadcast(event: GameMessage): void {
    this.peer.sendGameEvent(event);
    useVaseStore.getState().applyEvent(event);
  }

  private tick(): void {
    if (this.disposed) return;
    const now = Date.now();
    const dt = this.lastTickTs != null ? Math.max(0, (now - this.lastTickTs) / 1000) : TICK_MS / 1000;
    this.lastTickTs = now;

    const { localFrame, remoteFrame } = useRoomStore.getState();
    const energyA = localFrame?.movementEnergy ?? 0;
    const energyB = remoteFrame?.movementEnergy ?? 0;
    const diff = Math.abs(energyA - energyB);
    const instability = clamp01((diff - DIFF_STABLE) / (DIFF_UNSTABLE - DIFF_STABLE));
    const avgEffort = (energyA + energyB) / 2;

    this.integrity = clamp01(
      this.integrity + (instability > 0 ? -instability * INTEGRITY_DECAY_PER_SEC * dt : INTEGRITY_RECOVER_PER_SEC * dt)
    );

    if (avgEffort >= MIN_EFFORT) {
      this.progress = clamp01(this.progress + PROGRESS_RATE_PER_SEC * (1 - instability) * dt);
    }

    if (this.integrity <= 0) {
      this.finish(false);
    } else if (this.progress >= 1) {
      this.finish(true);
    } else {
      this.broadcast({ type: "vase-tick", phase: "carrying", progress: this.progress, integrity: this.integrity, instability });
    }
  }

  private finish(success: boolean): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.broadcast({ type: "vase-result", success });
  }

  dispose(): void {
    this.disposed = true;
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
