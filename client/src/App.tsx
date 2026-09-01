import { useCallback, useEffect, useRef, useState } from "react";
import { Lobby } from "./components/Lobby";
import { CameraPreview } from "./components/CameraPreview";
import { PrivacyNotice } from "./components/PrivacyNotice";
import { AccountBar } from "./components/AccountBar";
import { AuthScreen } from "./components/AuthScreen";
import { GameOverlay } from "./components/GameOverlay";
import { VaseOverlay } from "./components/VaseOverlay";
import { VaseAudioController } from "./components/VaseAudioController";
import { ManualControls } from "./components/ManualControls";
import { Room } from "./scenes/Room";
import { useRoomStore } from "./state/roomStore";
import { useAuthStore } from "./state/authStore";
import { useGameStore } from "./state/gameStore";
import { useVaseStore } from "./state/vaseStore";
import { SignalingClient, type PeerProfile } from "./lib/webrtc/signalingClient";
import { TrackingPeerConnection } from "./lib/webrtc/peerConnection";
import { FaceHandTracker, type TrackerStatus } from "./lib/tracking/faceHandTracker";
import { GameEngine } from "./game/gameEngine";
import { VaseEngine } from "./game/vaseEngine";
import { submitGameResult } from "./lib/api";
import { DEFAULT_AVATAR_CONFIG } from "./avatar/avatarOptions";
import { buildManualFrame } from "./lib/tracking/manualControl";
import type { ExpressionLabel, HandGestureLabel } from "./types/tracking";

const SEND_INTERVAL_MS = 1000 / 25; // ~25 fps over the data channel is plenty for expression data
const HAND_UPDATE_INTERVAL_MS = 100; // 10Hz to the server is plenty for proximity checks — this isn't animation data

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
  const vaseEngineRef = useRef<VaseEngine | null>(null);
  const lastSendRef = useRef(0);
  const lastHandSendRef = useRef(0);
  const autoJoinAttempted = useRef(false);
  const gameResultSubmitted = useRef(false);
  const vaseResultSubmitted = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [inviteCode] = useState(getInviteCodeFromUrl);
  const [highFiveFlash, setHighFiveFlash] = useState(false);
  const [manualExpression, setManualExpression] = useState<ExpressionLabel>("neutral");
  const [manualGesture, setManualGesture] = useState<HandGestureLabel>("idle");
  const [activeGameMode, setActiveGameMode] = useState<"none" | "mirror" | "vase">("none");
  const [cameraConsent, setCameraConsent] = useState<"unset" | "granted" | "declined">("unset");
  const [cameraEnabled, setCameraEnabled] = useState(false);

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
  const handsHolding = useRoomStore((s) => s.handsHolding);
  const setHandsHolding = useRoomStore((s) => s.setHandsHolding);
  const resetRoom = useRoomStore((s) => s.reset);

  const gamePhase = useGameStore((s) => s.phase);
  const gameScore = useGameStore((s) => s.score);
  const vasePhase = useVaseStore((s) => s.phase);

  // Declining the privacy notice skips straight to manual controls — never attempts getUserMedia.
  useEffect(() => {
    if (cameraConsent === "declined") setTrackerStatus("error");
  }, [cameraConsent]);

  // Bring up camera + tracker once the user has explicitly consented and enabled it. Re-runs
  // (via the cleanup below) whenever cameraEnabled toggles off — that's the on/off control:
  // toggling off stops the tracks and disposes the tracker, toggling back on re-acquires fresh.
  useEffect(() => {
    if (!token || !cameraEnabled) return;
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
          if (signalingRef.current && now - lastHandSendRef.current >= HAND_UPDATE_INTERVAL_MS) {
            lastHandSendRef.current = now;
            signalingRef.current.sendHandUpdate(
              frame.leftHand?.present ? frame.leftHand.wrist : null,
              frame.rightHand?.present ? frame.rightHand.wrist : null
            );
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
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, cameraEnabled]);

  const enableCamera = useCallback(() => {
    setCameraConsent("granted");
    setCameraEnabled(true);
  }, []);

  const declineCamera = useCallback(() => {
    setCameraConsent("declined");
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((prev) => {
      if (prev) {
        setTrackerStatus("error"); // camera is now off by choice, not failure, but "manual controls" is the right fallback either way
        return false;
      }
      setTrackerStatus("loading");
      return true;
    });
  }, []);

  const connectToPeer = useCallback(
    (signaling: SignalingClient, peerId: string, peer: PeerProfile | null, isInitiator: boolean) => {
      if (peer) setPeerProfile(peer);
      setIsHost(isInitiator);
      const conn = new TrackingPeerConnection(
        signaling,
        peerId,
        (frame) => setRemoteFrame(frame),
        (event) => {
          if (event.type.startsWith("vase-")) {
            setActiveGameMode("vase");
            useVaseStore.getState().applyEvent(event);
          } else {
            setActiveGameMode("mirror");
            useGameStore.getState().applyEvent(event);
          }
        },
        (state) => setConnectionState(state)
      );
      peerRef.current = conn;
      gameEngineRef.current = new GameEngine(conn, isInitiator);
      vaseEngineRef.current = new VaseEngine(conn, isInitiator);
      setPhase("in-room");
      if (isInitiator) void conn.createOffer();
    },
    [setConnectionState, setIsHost, setPeerProfile, setPhase, setRemoteFrame]
  );

  // Room-level events tied to the signaling socket's lifetime, not to any one peer connection —
  // registered once per signaling client so a reconnect (which calls connectToPeer again) doesn't
  // stack up duplicate listeners that would each fire on the same event.
  const bindRoomEvents = useCallback(
    (signaling: SignalingClient) => {
      signaling.onInteractionState((holding) => setHandsHolding(holding));
      signaling.onHighFive(() => {
        setHighFiveFlash(true);
        setTimeout(() => setHighFiveFlash(false), 1200);
      });
      signaling.onGameSessionStarted((sessionId) => {
        sessionIdRef.current = sessionId;
      });
    },
    [setHandsHolding]
  );

  // Re-armed after every peer-left so a friend who disconnects and rejoins (same room code)
  // still triggers a fresh offer — a one-shot `.once` here would only ever catch the first join.
  const waitForPeer = useCallback(
    (signaling: SignalingClient) => {
      signaling.socket.once("room:peer-joined", ({ peerId, peerProfile: joinedProfile }) => {
        connectToPeer(signaling, peerId, joinedProfile, true);
      });
    },
    [connectToPeer]
  );

  const handlePeerLeft = useCallback(
    (signaling: SignalingClient) => {
      gameEngineRef.current?.dispose();
      gameEngineRef.current = null;
      vaseEngineRef.current?.dispose();
      vaseEngineRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      setPeerProfile(null);
      setRemoteFrame(null);
      setConnectionState("disconnected");
      setActiveGameMode("none");
      setPhase("lobby");
      waitForPeer(signaling);
    },
    [setActiveGameMode, setConnectionState, setPeerProfile, setPhase, setRemoteFrame, waitForPeer]
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
    bindRoomEvents(signaling);
    signaling.socket.on("room:peer-left", () => handlePeerLeft(signaling));
    waitForPeer(signaling);
  }, [bindRoomEvents, handlePeerLeft, setError, setRoomCode, token, waitForPeer]);

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
      bindRoomEvents(signaling);
      signaling.socket.on("room:peer-left", () => handlePeerLeft(signaling));
      connectToPeer(signaling, result.peerId, result.peerProfile, false);
    },
    [bindRoomEvents, connectToPeer, handlePeerLeft, setError, setRoomCode, token]
  );

  // Invitation links: ?room=CODE auto-joins once the user is authenticated.
  useEffect(() => {
    if (!token || !inviteCode || autoJoinAttempted.current || phase !== "lobby") return;
    autoJoinAttempted.current = true;
    void handleJoin(inviteCode);
  }, [token, inviteCode, phase, handleJoin]);

  const handleManualState = useCallback(
    (expression: ExpressionLabel, gesture: HandGestureLabel) => {
      setManualExpression(expression);
      setManualGesture(gesture);
      const frame = buildManualFrame(expression, gesture);
      setLocalFrame(frame);
      peerRef.current?.sendFrame(frame);
      signalingRef.current?.sendHandUpdate(
        frame.leftHand?.present ? frame.leftHand.wrist : null,
        frame.rightHand?.present ? frame.rightHand.wrist : null
      );
    },
    [setLocalFrame]
  );

  const startMirrorMoment = useCallback(() => {
    gameResultSubmitted.current = false;
    sessionIdRef.current = null;
    signalingRef.current?.startGameSession();
    setActiveGameMode("mirror");
    gameEngineRef.current?.start();
  }, []);

  const startVase = useCallback(() => {
    vaseResultSubmitted.current = false;
    sessionIdRef.current = null;
    signalingRef.current?.startGameSession();
    setActiveGameMode("vase");
    vaseEngineRef.current?.start();
  }, []);

  const leaveRoom = useCallback(() => {
    gameEngineRef.current?.dispose();
    gameEngineRef.current = null;
    vaseEngineRef.current?.dispose();
    vaseEngineRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.leaveRoom();
    signalingRef.current?.dispose();
    signalingRef.current = null;
    gameResultSubmitted.current = false;
    vaseResultSubmitted.current = false;
    useGameStore.getState().reset(false);
    useVaseStore.getState().reset(false);
    setActiveGameMode("none");
    resetRoom();
  }, [resetRoom]);

  useEffect(() => {
    return () => {
      gameEngineRef.current?.dispose();
      vaseEngineRef.current?.dispose();
      peerRef.current?.close();
      signalingRef.current?.dispose();
    };
  }, []);

  // Persist the result once a game finishes — each side submits its own observed score, and the
  // server only accepts it once both sides' submissions match (see gameSessions.ts server-side;
  // this client just reports what it saw and waits).
  useEffect(() => {
    if (gamePhase !== "game-over" || !token || gameResultSubmitted.current || !sessionIdRef.current) return;
    gameResultSubmitted.current = true;
    submitGameResult(token, sessionIdRef.current, gameScore)
      .then((res) => {
        if ("profile" in res) updateProfile(res.profile);
      })
      .catch((err) => console.warn("Failed to submit game result", err));
  }, [gamePhase, gameScore, token, updateProfile]);

  useEffect(() => {
    if ((vasePhase !== "success" && vasePhase !== "broken") || !token || vaseResultSubmitted.current || !sessionIdRef.current) return;
    vaseResultSubmitted.current = true;
    submitGameResult(token, sessionIdRef.current, vasePhase === "success" ? 1 : 0)
      .then((res) => {
        if ("profile" in res) updateProfile(res.profile);
      })
      .catch((err) => console.warn("Failed to submit vase result", err));
  }, [vasePhase, token, updateProfile]);

  if (!token || !profile) {
    return <AuthScreen />;
  }

  if (cameraConsent === "unset") {
    return <PrivacyNotice onAccept={enableCamera} onDecline={declineCamera} />;
  }

  const trackerLabel =
    trackerStatus === "loading" ? "Loading tracking models..." : trackerStatus === "error" ? "Tracking unavailable" : "Tracking ready";

  return (
    <div className="app">
      <AccountBar />
      <CameraPreview videoRef={videoRef} status={trackerLabel} />
      <button className="camera-toggle" onClick={toggleCamera}>
        {cameraEnabled ? "Turn camera off" : "Turn camera on"}
      </button>

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
            localAvatarConfig={profile.avatarConfig}
            remoteAvatarConfig={peerProfile?.avatarConfig ?? DEFAULT_AVATAR_CONFIG}
            localAvatarUrl={profile.avatarUrl}
            remoteAvatarUrl={peerProfile?.avatarUrl ?? null}
            localLabel={profile.displayName}
            remoteLabel={peerProfile?.displayName ?? null}
            handsHolding={handsHolding}
            vaseActive={activeGameMode === "vase"}
          />
          {activeGameMode === "vase" && <VaseAudioController />}
          {highFiveFlash && <div className="high-five-toast">🙌 High five!</div>}
          {trackerStatus === "error" && (
            <ManualControls
              expression={manualExpression}
              gesture={manualGesture}
              onExpression={(expression) => handleManualState(expression, manualGesture)}
              onGesture={(gesture) => handleManualState(manualExpression, gesture)}
            />
          )}
          {connectionState === "connected" && activeGameMode === "none" && (
            <div className="game-overlay game-overlay--center">
              {isHost ? (
                <div className="game-mode-picker">
                  <button className="game-overlay__cta" onClick={startMirrorMoment}>
                    Mirror Moment
                  </button>
                  <button className="game-overlay__cta" onClick={startVase}>
                    The Vase
                  </button>
                </div>
              ) : (
                <p className="game-overlay__hint">Waiting for your friend to choose a game...</p>
              )}
            </div>
          )}
          {connectionState === "connected" && activeGameMode === "mirror" && (
            <GameOverlay isHost={isHost} onStart={startMirrorMoment} onPlayAgain={startMirrorMoment} />
          )}
          {connectionState === "connected" && activeGameMode === "vase" && (
            <VaseOverlay isHost={isHost} onStart={startVase} onPlayAgain={startVase} />
          )}
        </div>
      )}
    </div>
  );
}
