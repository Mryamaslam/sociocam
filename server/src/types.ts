import type { AvatarConfig } from "./avatarOptions.js";
import type { HandPosition } from "./spatialMath.js";

export interface PeerProfile {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  /** Set once the user has uploaded a realistic rigged avatar; null = render the procedural fallback. */
  avatarUrl: string | null;
}

export interface RoomMember extends PeerProfile {
  socketId: string;
  joinedAt: number;
}

export interface Room {
  code: string;
  members: RoomMember[];
  createdAt: number;
}

export const MAX_ROOM_SIZE = 2;

export interface HandPositions {
  leftHand: HandPosition | null;
  rightHand: HandPosition | null;
}

export interface ClientToServerEvents {
  "room:create": (ack: (res: { code: string }) => void) => void;
  "room:join": (
    code: string,
    ack: (res: { ok: true; peerId: string | null; peerProfile: PeerProfile | null } | { ok: false; error: string }) => void
  ) => void;
  "room:leave": () => void;
  "webrtc:offer": (payload: { to: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { to: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { to: string; candidate: RTCIceCandidateInit }) => void;
  /** Reports only the sender's OWN hand positions — never a claim about the other person. The
   * server decides hold/high-five state from both sides' reports; see interactions.ts. */
  "hand:update": (payload: HandPositions) => void;
  /** Host starts a cooperative-game round. The server hands back a session id both players must
   * submit against — see gameSessions.ts and "never trust client points". */
  "game:session-start": () => void;
}

export interface ServerToClientEvents {
  "room:peer-joined": (payload: { peerId: string; peerProfile: PeerProfile }) => void;
  "room:peer-left": (payload: { peerId: string }) => void;
  "webrtc:offer": (payload: { from: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { from: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { from: string; candidate: RTCIceCandidateInit }) => void;
  /** Authoritative — the server's own determination, not a relay of either client's opinion. */
  "interaction:state": (payload: { holding: boolean }) => void;
  "interaction:high-five": () => void;
  "game:session-started": (payload: { sessionId: string }) => void;
}
