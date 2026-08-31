import { useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AvatarRig } from "../avatar/AvatarRig";
import type { TrackingFrame } from "../types/tracking";
import { handsAreHeld, LOCAL_AVATAR_POS, REMOTE_AVATAR_POS } from "../game/gestures";

interface RoomProps {
  localFrame: TrackingFrame | null;
  remoteFrame: TrackingFrame | null;
  connected: boolean;
  localColor: string;
  remoteColor: string;
}

function HoldHandsWatcher({
  localFrame,
  remoteFrame,
  onChange,
}: {
  localFrame: TrackingFrame | null;
  remoteFrame: TrackingFrame | null;
  onChange: (held: boolean) => void;
}) {
  useFrame(() => {
    onChange(handsAreHeld(localFrame, remoteFrame));
  });
  return null;
}

export function Room({ localFrame, remoteFrame, connected, localColor, remoteColor }: RoomProps) {
  const [holdingHands, setHoldingHands] = useState(false);

  return (
    <Canvas camera={{ position: [0, 0.4, 3.2], fov: 45 }} style={{ width: "100%", height: "100%" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <hemisphereLight args={["#8fa8c2", "#1c2430", 0.5]} />

      {connected && <HoldHandsWatcher localFrame={localFrame} remoteFrame={remoteFrame} onChange={setHoldingHands} />}

      <AvatarRig
        position={LOCAL_AVATAR_POS}
        face={localFrame?.face ?? null}
        leftHand={localFrame?.leftHand ?? null}
        rightHand={localFrame?.rightHand ?? null}
        pose={localFrame?.pose ?? null}
        color={localColor}
        facingSign={1}
        highlightHands={holdingHands}
      />

      {connected && (
        <AvatarRig
          position={REMOTE_AVATAR_POS}
          face={remoteFrame?.face ?? null}
          leftHand={remoteFrame?.leftHand ?? null}
          rightHand={remoteFrame?.rightHand ?? null}
          pose={remoteFrame?.pose ?? null}
          color={remoteColor}
          facingSign={-1}
          highlightHands={holdingHands}
        />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#1c2430" />
      </mesh>

      <OrbitControls enablePan={false} minDistance={2} maxDistance={6} target={[0, -0.2, 0]} />
    </Canvas>
  );
}
