import type { SignalingClient } from "./signalingClient";
import type { TrackingFrame } from "../../types/tracking";
import type { DataChannelMessage, GameMessage } from "../../game/protocol";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export type ConnectionState = "connecting" | "connected" | "disconnected" | "failed";

/**
 * Peer-to-peer link carrying tracking data and game-round messages (no raw video/audio) —
 * the avatar is the thing being transmitted, not the camera feed.
 */
export class TrackingPeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private remotePeerId: string;
  private signaling: SignalingClient;
  private onFrame: (frame: TrackingFrame) => void;
  private onGameMessage: (event: GameMessage) => void;
  private onStateChange: (state: ConnectionState) => void;

  constructor(
    signaling: SignalingClient,
    remotePeerId: string,
    onFrame: (frame: TrackingFrame) => void,
    onGameMessage: (event: GameMessage) => void,
    onStateChange: (state: ConnectionState) => void
  ) {
    this.signaling = signaling;
    this.remotePeerId = remotePeerId;
    this.onFrame = onFrame;
    this.onGameMessage = onGameMessage;
    this.onStateChange = onStateChange;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.socket.emit("webrtc:ice-candidate", {
          to: this.remotePeerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") this.onStateChange("connected");
      else if (state === "disconnected") this.onStateChange("disconnected");
      else if (state === "failed" || state === "closed") this.onStateChange("failed");
    };

    this.pc.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };

    this.signaling.socket.on("webrtc:offer", this.handleRemoteOffer);
    this.signaling.socket.on("webrtc:answer", this.handleRemoteAnswer);
    this.signaling.socket.on("webrtc:ice-candidate", this.handleRemoteIce);
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as DataChannelMessage;
        if (message.kind === "tracking") this.onFrame(message.frame);
        else if (message.kind === "game") this.onGameMessage(message.event);
      } catch {
        // ignore malformed message
      }
    };
  }

  private handleRemoteOffer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
    if (from !== this.remotePeerId) return;
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.socket.emit("webrtc:answer", { to: this.remotePeerId, sdp: answer });
  };

  private handleRemoteAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
    if (from !== this.remotePeerId) return;
    await this.pc.setRemoteDescription(sdp);
  };

  private handleRemoteIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
    if (from !== this.remotePeerId) return;
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("Failed to add ICE candidate", err);
    }
  };

  /** Call this on the peer that initiates the connection (the one who was already in the room). */
  async createOffer(): Promise<void> {
    this.attachChannel(this.pc.createDataChannel("tracking", { ordered: false, maxRetransmits: 0 }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.socket.emit("webrtc:offer", { to: this.remotePeerId, sdp: offer });
  }

  private sendMessage(message: DataChannelMessage): void {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify(message));
    }
  }

  sendFrame(frame: TrackingFrame): void {
    this.sendMessage({ kind: "tracking", frame });
  }

  sendGameEvent(event: GameMessage): void {
    this.sendMessage({ kind: "game", event });
  }

  close(): void {
    this.signaling.socket.off("webrtc:offer", this.handleRemoteOffer);
    this.signaling.socket.off("webrtc:answer", this.handleRemoteAnswer);
    this.signaling.socket.off("webrtc:ice-candidate", this.handleRemoteIce);
    this.channel?.close();
    this.pc.close();
  }
}
