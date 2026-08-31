export interface PeerProfile {
  userId: string;
  displayName: string;
  avatarColor: string;
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
}

export interface ServerToClientEvents {
  "room:peer-joined": (payload: { peerId: string; peerProfile: PeerProfile }) => void;
  "room:peer-left": (payload: { peerId: string }) => void;
  "webrtc:offer": (payload: { from: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (payload: { from: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (payload: { from: string; candidate: RTCIceCandidateInit }) => void;
}
