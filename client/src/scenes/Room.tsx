import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { PlayerAvatar } from "../avatar/PlayerAvatar";
import type { TrackingFrame } from "../types/tracking";
import { LOCAL_AVATAR_POS, REMOTE_AVATAR_POS } from "../game/gestures";
import type { AvatarConfig } from "../avatar/avatarOptions";
import { VaseObject, DestinationTable } from "./VaseObject";

// A mouth-open reading above this is treated as "currently talking" for the speaking indicator —
// picked to catch normal speech movement without flickering on the small resting jitter tracking
// noise produces around 0.
const SPEAKING_THRESHOLD = 0.15;

function AvatarLabel({ position, name, speaking }: { position: readonly [number, number, number]; name: string; speaking: boolean }) {
  return (
    <Html position={[position[0], 0.6, position[2]]} center distanceFactor={6} style={{ pointerEvents: "none" }}>
      <div className="avatar-label">
        {speaking && <span className="avatar-label__speaking-dot" aria-label="speaking" />}
        <span>{name}</span>
      </div>
    </Html>
  );
}

const BASE_CAMERA_Z = 3.2;
const BASE_FOV_DEG = 45;
// Both avatars sit at x=±0.7 (see LOCAL_AVATAR_POS/REMOTE_AVATAR_POS) — comfortably framed side by
// side needs roughly this much visible half-width. fov is the *vertical* field of view, so on a
// narrow/portrait viewport the same fov shows much less horizontal world space at a fixed distance
// and both avatars crop off-screen. Dolly the camera back until that half-width is visible again;
// wide (landscape) viewports already clear this comfortably at the base distance, so they're untouched.
const TARGET_HALF_WIDTH = 1.6;
const MAX_CAMERA_Z = 9.5;

function ResponsiveCameraRig() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useEffect(() => {
    const aspect = width / height;
    const halfTan = Math.tan((BASE_FOV_DEG * Math.PI) / 360);
    const halfWidthAtBase = BASE_CAMERA_Z * halfTan * aspect;
    const z =
      halfWidthAtBase >= TARGET_HALF_WIDTH ? BASE_CAMERA_Z : Math.min(TARGET_HALF_WIDTH / (halfTan * aspect), MAX_CAMERA_Z);
    camera.position.z = z;
    camera.updateProjectionMatrix();
  }, [camera, width, height]);
  return null;
}

interface RoomProps {
  localFrame: TrackingFrame | null;
  remoteFrame: TrackingFrame | null;
  connected: boolean;
  localAvatarConfig: AvatarConfig;
  remoteAvatarConfig: AvatarConfig;
  localAvatarUrl: string | null;
  remoteAvatarUrl: string | null;
  localLabel: string;
  remoteLabel: string | null;
  /** Authoritative — from the server, not computed locally. See roomStore.handsHolding. */
  handsHolding: boolean;
  vaseActive: boolean;
}

export function Room({
  localFrame,
  remoteFrame,
  connected,
  localAvatarConfig,
  remoteAvatarConfig,
  localAvatarUrl,
  remoteAvatarUrl,
  localLabel,
  remoteLabel,
  handsHolding,
  vaseActive,
}: RoomProps) {
  return (
    <Canvas camera={{ position: [0, 0.4, BASE_CAMERA_Z], fov: BASE_FOV_DEG }} style={{ width: "100%", height: "100%" }}>
      <ResponsiveCameraRig />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <hemisphereLight args={["#8fa8c2", "#1c2430", 0.5]} />

      <PlayerAvatar
        position={LOCAL_AVATAR_POS}
        face={localFrame?.face ?? null}
        expression={localFrame?.expression ?? "neutral"}
        leftHand={localFrame?.leftHand ?? null}
        rightHand={localFrame?.rightHand ?? null}
        pose={localFrame?.pose ?? null}
        avatarConfig={localAvatarConfig}
        avatarUrl={localAvatarUrl}
        facingSign={1}
        highlightHands={handsHolding}
      />
      <AvatarLabel position={LOCAL_AVATAR_POS} name={localLabel} speaking={(localFrame?.face?.mouthOpen ?? 0) > SPEAKING_THRESHOLD} />

      {connected && (
        <>
          <PlayerAvatar
            position={REMOTE_AVATAR_POS}
            face={remoteFrame?.face ?? null}
            expression={remoteFrame?.expression ?? "neutral"}
            leftHand={remoteFrame?.leftHand ?? null}
            rightHand={remoteFrame?.rightHand ?? null}
            pose={remoteFrame?.pose ?? null}
            avatarConfig={remoteAvatarConfig}
            avatarUrl={remoteAvatarUrl}
            facingSign={-1}
            highlightHands={handsHolding}
          />
          {remoteLabel && (
            <AvatarLabel
              position={REMOTE_AVATAR_POS}
              name={remoteLabel}
              speaking={(remoteFrame?.face?.mouthOpen ?? 0) > SPEAKING_THRESHOLD}
            />
          )}
        </>
      )}

      {vaseActive && (
        <>
          <DestinationTable />
          <VaseObject
            localHand={localFrame?.rightHand ?? localFrame?.leftHand ?? null}
            remoteHand={remoteFrame?.rightHand ?? remoteFrame?.leftHand ?? null}
          />
        </>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#1c2430" />
      </mesh>

      <OrbitControls enablePan={false} minDistance={2} maxDistance={MAX_CAMERA_Z + 1} target={[0, -0.2, 0]} />
    </Canvas>
  );
}
