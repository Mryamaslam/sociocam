import { useGameStore } from "../state/gameStore";
import { useRoomStore } from "../state/roomStore";
import { bothSatisfyGesture } from "./gestures";
import { GESTURE_SEQUENCE } from "./protocol";
import type { GameMessage } from "./protocol";
import type { TrackingPeerConnection } from "../lib/webrtc/peerConnection";

const ROUND_DURATION_MS = 6000;
const RESULT_PAUSE_MS = 1800;
const CHECK_INTERVAL_MS = 120;

/**
 * Host-authoritative "Mirror Moment" round loop: the room creator picks each round's gesture,
 * evaluates both players' tracking frames, and broadcasts round/game state to the other peer.
 * The joiner never runs this — it just renders whatever the host broadcasts.
 */
export class GameEngine {
  private peer: TrackingPeerConnection;
  private isHost: boolean;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private roundTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultTimeout: ReturnType<typeof setTimeout> | null = null;
  private score = 0;
  private disposed = false;

  constructor(peer: TrackingPeerConnection, isHost: boolean) {
    this.peer = peer;
    this.isHost = isHost;
    useGameStore.getState().reset(isHost);
  }

  start(): void {
    if (!this.isHost || this.disposed) return;
    this.score = 0;
    this.runRound(0);
  }

  private broadcast(event: GameMessage): void {
    this.peer.sendGameEvent(event);
    useGameStore.getState().applyEvent(event);
  }

  private runRound(roundIndex: number): void {
    if (this.disposed) return;
    if (roundIndex >= GESTURE_SEQUENCE.length) {
      this.broadcast({ type: "game-over", score: this.score, totalRounds: GESTURE_SEQUENCE.length });
      return;
    }
    const gesture = GESTURE_SEQUENCE[roundIndex];
    const deadlineTs = Date.now() + ROUND_DURATION_MS;
    this.broadcast({ type: "round-start", roundIndex, totalRounds: GESTURE_SEQUENCE.length, gesture, deadlineTs });

    this.checkInterval = setInterval(() => {
      const { localFrame, remoteFrame, handsHolding } = useRoomStore.getState();
      // hold-hands is judged by the server's authoritative state, not this client's own
      // proximity guess — a client (host included) can't just decide it happened.
      const satisfied = gesture === "hold-hands" ? handsHolding : bothSatisfyGesture(localFrame, remoteFrame, gesture);
      if (satisfied) {
        this.finishRound(roundIndex, true);
      }
    }, CHECK_INTERVAL_MS);

    this.roundTimeout = setTimeout(() => this.finishRound(roundIndex, false), ROUND_DURATION_MS);
  }

  private finishRound(roundIndex: number, success: boolean): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    this.checkInterval = null;
    this.roundTimeout = null;
    if (success) this.score += 1;
    this.broadcast({ type: "round-result", roundIndex, success });
    this.resultTimeout = setTimeout(() => this.runRound(roundIndex + 1), RESULT_PAUSE_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    if (this.resultTimeout) clearTimeout(this.resultTimeout);
  }
}
