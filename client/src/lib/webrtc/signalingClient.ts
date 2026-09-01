import { io, type Socket } from "socket.io-client";
import type { AvatarConfig } from "../../avatar/avatarOptions";
import type { Point3 } from "../../types/tracking";

// Undefined = same-origin (routed to the signaling server by the dev server's proxy —
// see vite.config.ts). Only set VITE_SIGNALING_URL when the server truly lives on a
// different host than the client (e.g. a real production deployment).
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || undefined;

export interface PeerProfile {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  avatarUrl: string | null;
}

export interface RoomJoinResult {
  ok: boolean;
  peerId: string | null;
  peerProfile: PeerProfile | null;
  error?: string;
}

export class SignalingClient {
  readonly socket: Socket;

  constructor(token: string) {
    this.socket = io(SIGNALING_URL, { transports: ["websocket"], auth: { token } });
  }

  get id(): string {
    return this.socket.id ?? "";
  }

  waitForConnect(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (err) => reject(err));
    });
  }

  createRoom(): Promise<string> {
    return new Promise((resolve) => {
      this.socket.emit("room:create", (res: { code: string }) => resolve(res.code));
    });
  }

  joinRoom(code: string): Promise<RoomJoinResult> {
    return new Promise((resolve) => {
      this.socket.emit("room:join", code, (res: any) => {
        if (res.ok) resolve({ ok: true, peerId: res.peerId, peerProfile: res.peerProfile });
        else resolve({ ok: false, peerId: null, peerProfile: null, error: res.error });
      });
    });
  }

  leaveRoom(): void {
    this.socket.emit("room:leave");
  }

  /** Reports only this client's own hand positions — the server decides hold/high-five state from both sides. */
  sendHandUpdate(leftHand: Point3 | null, rightHand: Point3 | null): void {
    this.socket.emit("hand:update", { leftHand, rightHand });
  }

  onInteractionState(cb: (holding: boolean) => void): void {
    this.socket.on("interaction:state", ({ holding }) => cb(holding));
  }

  onHighFive(cb: () => void): void {
    this.socket.on("interaction:high-five", cb);
  }

  /** Tells the server a cooperative-game round is starting. The server hands back a session id
   * (broadcast to both players) that a later score submission must reference — see
   * gameSessions.ts. Without this, a client could just POST an arbitrary score directly. */
  startGameSession(): void {
    this.socket.emit("game:session-start");
  }

  onGameSessionStarted(cb: (sessionId: string) => void): void {
    this.socket.on("game:session-started", ({ sessionId }) => cb(sessionId));
  }

  dispose(): void {
    this.socket.disconnect();
  }
}
