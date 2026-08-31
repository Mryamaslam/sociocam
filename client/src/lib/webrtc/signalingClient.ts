import { io, type Socket } from "socket.io-client";

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000";

export interface PeerProfile {
  userId: string;
  displayName: string;
  avatarColor: string;
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

  dispose(): void {
    this.socket.disconnect();
  }
}
