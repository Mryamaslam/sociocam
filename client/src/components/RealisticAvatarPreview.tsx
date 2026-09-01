import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { RealisticAvatarRig } from "../avatar/RealisticAvatarRig";

interface RealisticAvatarPreviewProps {
  url: string;
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "Could not load this file" };
  }
  render() {
    if (this.state.failed) return <p className="lobby__error">Preview failed: {this.state.message}</p>;
    return this.props.children;
  }
}

/** Full-body framing, unlike the tight bust-only procedural preview — a realistic GLB is a whole
 * humanoid, not just a head+torso. Zoom is enabled so the user can actually check their upload. */
export function RealisticAvatarPreview({ url }: RealisticAvatarPreviewProps) {
  return (
    <div className="avatar-preview avatar-preview--realistic">
      <PreviewErrorBoundary>
        <Suspense fallback={null}>
          <Canvas camera={{ position: [0, 0.2, 3.2], fov: 40 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[2, 3, 2]} intensity={1.1} />
            <hemisphereLight args={["#8fa8c2", "#1c2430", 0.5]} />
            <RealisticAvatarRig
              url={url}
              position={[0, 0, 0]}
              face={null}
              expression="neutral"
              leftHand={null}
              rightHand={null}
              pose={null}
              facingSign={1}
            />
            <OrbitControls enablePan={false} target={[0, -0.5, 0]} minDistance={1.2} maxDistance={5} />
          </Canvas>
        </Suspense>
      </PreviewErrorBoundary>
    </div>
  );
}
