import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AvatarRig } from "../avatar/AvatarRig";
import type { AvatarConfig } from "../avatar/avatarOptions";

interface AvatarPreviewProps {
  avatarConfig: AvatarConfig;
}

/** A small idle preview of the avatar customizer's current selection — no tracking data, just neutral pose. */
export function AvatarPreview({ avatarConfig }: AvatarPreviewProps) {
  return (
    <div className="avatar-preview">
      <Canvas camera={{ position: [0, 0.1, 2.4], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <hemisphereLight args={["#8fa8c2", "#1c2430", 0.5]} />
        <AvatarRig
          position={[0, 0, 0]}
          face={null}
          expression="neutral"
          leftHand={null}
          rightHand={null}
          pose={null}
          avatarConfig={avatarConfig}
          facingSign={1}
        />
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.4} maxPolarAngle={Math.PI / 2.4} />
      </Canvas>
    </div>
  );
}
