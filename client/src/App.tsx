import { useCallback, useEffect, useRef, useState } from "react";
import { Lobby } from "./components/Lobby";
import { CameraPreview } from "./components/CameraPreview";
import { AccountBar } from "./components/AccountBar";
import { AuthScreen } from "./components/AuthScreen";
import { GameOverlay } from "./components/GameOverlay";
import { Room } from "./scenes/Room";
import { useRoomStore } from "./state/roomStore";
import { useAuthStore } from "./state/authStore";
import { useGameStore } from "./state/gameStore";
import { SignalingClient } from "./lib/webrtc/signalingClient";
import { TrackingPeerConnection } from "./lib/webrtc/peerConnection";
import { FaceHandTracker, type TrackerStatus } from "./lib/tracking/faceHandTracker";
import { GameEngine } from "./game/gameEngine";
import { submitGameResult } from "./lib/api";

const SEND_INTERVAL_MS = 1000 / 25; // ~25 fps over the data channel is plenty for expression data

function getInviteCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("room");
  return code ? code.toUpperCase() : null;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<TrackingPeerConnection | null>(null);
  const trackerRef = useRef<FaceHandTracker | null>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const lastSendRef = useRef(0);
  const autoJoinAttempted = useRef(false);
  const gameResultSubmitted = useRef(false);

  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [inviteCode] = useState(getInviteCodeFromUrl);

  const token = useAuthStore((s) => s.token);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const phase = useRoomStore((s) => s.phase);
  const roomCode = useRoomStore((s) => s.roomCode);
  const connectionState = useRoomStore((s) => s.connectionState);
  const localFrame = useRoomStore((s) => s.localFrame);
  const remoteFrame = useRoomStore((s) => s.remoteFrame);
  const peerProfile = useRoomStore((s) => s.peerProfile);
  const isHost = useRoomStore((s) => s.isHost);
  const error = useRoomStore((s) => s.error);
  const setPhase = useRoomStore((s) => s.setPhase);
  const setRoomCode = useRoomStore((s) => s.setRoomCode);
  const setConnectionState = useRoomStore((s) => s.setConnectionState);
  const setLocalFrame = useRoomStore((s) => s.setLocalFrame);
  const setRemoteFrame = useRoomStore((s) => s.setRemoteFrame);
  const setPeerProfile = useRoomStore((s) => s.setPeerProfile);
  const setIsHost = useRoomStore((s) => s.setIsHost);
  const setError = useRoomStore((s) => s.setError);
  const resetRoom = useRoomStore((s) => s.reset);

  const gamePhase = useGameStore((s) => s.phase);
  const gameScore = useGameStore((s) => s.score);

  // Bring up camera + tracker once authenticated, kept alive across lobby/room transitions.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const tracker = new FaceHandTracker();
    trackerRef.current = tracker;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        await tracker.init(setTrackerStatus);
        if (cancelled) return;
        tracker.start(video, (frame) => {
          setLocalFrame(frame);
          const now = performance.now();
          if (peerRef.current && now - lastSendRef.current >= SEND_INTERVAL_MS) {
            lastSendRef.current = now;
            peerRef.current.sendFrame(frame);
          }
        });
      } catch (err) {
        console.error("Camera/tracker setup failed", err);
        setTrackerStatus("error");
        setError("Could not access camera or load tracking models.");
      }
    })();

    return () => {
      cancelled = true;
      tracker.dispose();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const connectToPeer = useCallback(
    (signaling: SignalingClient, peerId: string, peer: { userId: string; displayName: string; avatarColor: string } | null, isInitiator: boolean) => {
      if (peer) setPeerProfile(peer);
      setIsHost(isInitiator);
      const conn = new TrackingPeerConnection(
        signaling,
        peerId,
        (frame) => setRemoteFrame(frame),
        (event) => useGameStore.getState().applyEvent(event),
        (state) => setConnectionState(state)
      );
      peerRef.current = conn;
      gameEngineRef.current = new GameEngine(conn, isInitiator);
      setPhase("in-room");
      if (isInitiator) void conn.createOffer();
    },
    [setConnectionState, setIsHost, setPeerProfile, setPhase, setRemoteFrame]
  );

  const handleCreate = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const signaling = new SignalingClient(token);
    signalingRef.current = signaling;
    await signaling.waitForConnect();
    const code = await signaling.createRoom();
    setRoomCode(code);
    setBusy(false);
    signaling.socket.once("room:peer-joined", ({ peerId, peerProfile: joinedProfile }) => {
      connectToPeer(signaling, peerId, joinedProfile, true);
    });
  }, [connectToPeer, setError, setRoomCode, token]);

  const handleJoin = useCallback(
    async (code: string) => {
      if (!token || !code) return;
      setBusy(true);
      setError(null);
      const signaling = new SignalingClient(token);
      signalingRef.current = signaling;
      await signaling.waitForConnect();
      const result = await signaling.joinRoom(code);
      setBusy(false);
      if (!result.ok || !result.peerId) {
        setError(result.error ?? "Room is empty — ask your friend to create it first.");
        signaling.dispose();
        return;
      }
      setRoomCode(code);
      connectToPeer(signaling, result.peerId, result.peerProfile, false);
    },
    [connectToPeer, setError, setRoomCode, token]
  );

  // Invitation links: ?room=CODE auto-joins once the user is authenticated.
  useEffect(() => {
    if (!token || !inviteCode || autoJoinAttempted.current || phase !== "lobby") return;
    autoJoinAttempted.current = true;
    void handleJoin(inviteCode);
  }, [token, inviteCode, phase, handleJoin]);

  const startGame = useCallback(() => {
    gameResultSubmitted.current = false;
    gameEngineRef.current?.start();
  }, []);

  const leaveRoom = useCallback(() => {
    gameEngineRef.current?.dispose();
    gameEngineRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.leaveRoom();
    signalingRef.current?.dispose();
    signalingRef.current = null;
    gameResultSubmitted.current = false;
    useGameStore.getState().reset(false);
    resetRoom();
  }, [resetRoom]);

  useEffect(() => {
    return () => {
      gameEngineRef.current?.dispose();
      peerRef.current?.close();
      signalingRef.current?.dispose();
    };
  }, []);

  // Persist the result once a game finishes, from whichever side just saw it.
  useEffect(() => {
    if (gamePhase !== "game-over" || !token || gameResultSubmitted.current) return;
    gameResultSubmitted.current = true;
    submitGameResult(token, gameScore)
      .then(({ profile: updated }) => updateProfile(updated))
      .catch((err) => console.warn("Failed to submit game result", err));
  }, [gamePhase, gameScore, token, updateProfile]);

  if (!token || !profile) {
    return <AuthScreen />;
  }

  const trackerLabel =
    trackerStatus === "loading" ? "Loading tracking models..." : trackerStatus === "error" ? "Tracking unavailable" : "Tracking ready";

  return (
    <div className="app">
      <AccountBar />
      <CameraPreview videoRef={videoRef} status={trackerLabel} />

      {phase === "lobby" && (
        <Lobby
          onCreate={handleCreate}
          onJoin={handleJoin}
          error={error}
          busy={busy}
          waitingRoomCode={roomCode}
          initialJoinCode={inviteCode ?? undefined}
        />
      )}

      {phase === "in-room" && (
        <div className="room-view">
          <div className="room-view__hud">
            <span>Room: {roomCode}</span>
            <span className={`status status--${connectionState}`}>{connectionState}</span>
            {peerProfile && <span>with {peerProfile.displayName}</span>}
            <button onClick={leaveRoom}>Leave</button>
          </div>
          <Room
            localFrame={localFrame}
            remoteFrame={remoteFrame}
            connected={connectionState === "connected"}
            localColor={profile.avatarColor}
            remoteColor={peerProfile?.avatarColor ?? "#de6f4f"}
          />
          {connectionState === "connected" && (
            <GameOverlay isHost={isHost} onStart={startGame} onPlayAgain={startGame} />
          )}
        </div>
      )}
    </div>
  );
}
