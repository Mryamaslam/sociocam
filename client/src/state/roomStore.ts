import { create } from "zustand";
import type { TrackingFrame } from "../types/tracking";
import type { ConnectionState } from "../lib/webrtc/peerConnection";
import type { PeerProfile } from "../lib/webrtc/signalingClient";

export type AppPhase = "lobby" | "connecting" | "in-room";

interface RoomState {
  phase: AppPhase;
  roomCode: string | null;
  connectionState: ConnectionState;
  localFrame: TrackingFrame | null;
  remoteFrame: TrackingFrame | null;
  peerProfile: PeerProfile | null;
  isHost: boolean;
  error: string | null;
  /** Authoritative — decided by the server from both sides' hand positions, never by this client alone. */
  handsHolding: boolean;

  setPhase: (phase: AppPhase) => void;
  setRoomCode: (code: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setLocalFrame: (frame: TrackingFrame) => void;
  setRemoteFrame: (frame: TrackingFrame | null) => void;
  setPeerProfile: (profile: PeerProfile | null) => void;
  setIsHost: (isHost: boolean) => void;
  setError: (error: string | null) => void;
  setHandsHolding: (holding: boolean) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  phase: "lobby",
  roomCode: null,
  connectionState: "connecting",
  localFrame: null,
  remoteFrame: null,
  peerProfile: null,
  isHost: false,
  error: null,
  handsHolding: false,

  setPhase: (phase) => set({ phase }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setLocalFrame: (localFrame) => set({ localFrame }),
  setRemoteFrame: (remoteFrame) => set({ remoteFrame }),
  setPeerProfile: (peerProfile) => set({ peerProfile }),
  setIsHost: (isHost) => set({ isHost }),
  setError: (error) => set({ error }),
  setHandsHolding: (handsHolding) => set({ handsHolding }),
  reset: () =>
    set({
      phase: "lobby",
      roomCode: null,
      connectionState: "connecting",
      localFrame: null,
      remoteFrame: null,
      peerProfile: null,
      isHost: false,
      error: null,
      handsHolding: false,
    }),
}));
