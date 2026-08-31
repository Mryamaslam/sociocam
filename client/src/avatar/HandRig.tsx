import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HandState } from "../types/tracking";
import { handWorldPosition } from "./handMapping";

interface HandRigProps {
  hand: HandState | null;
  avatarPosition: readonly [number, number, number];
  highlighted?: boolean;
}

const lerp = THREE.MathUtils.lerp;
const FINGER_OFFSETS = [
  [-0.06, 0.04],
  [-0.03, 0.06],
  [0, 0.065],
  [0.03, 0.06],
  [0.06, 0.045],
] as const;

/** Renders a hand as a small cluster of fingertip markers so open/curl gestures read clearly at a glance. */
export function HandRig({ hand, avatarPosition, highlighted }: HandRigProps) {
  const groupRef = useRef<THREE.Group>(null);
  const tipRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, delta) => {
    const smooth = 1 - Math.pow(0.001, delta);
    const group = groupRef.current;
    if (!group) return;

    if (!hand?.present) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const [worldX, worldY, worldZ] = handWorldPosition(avatarPosition, hand);
    // group is a child of the avatar's own <group position=avatarPosition>, so use local (world - avatarPosition) coords.
    group.position.x = lerp(group.position.x, worldX - avatarPosition[0], smooth);
    group.position.y = lerp(group.position.y, worldY - avatarPosition[1], smooth);
    group.position.z = lerp(group.position.z, worldZ - avatarPosition[2], smooth);

    const spread = lerp(1, 0.35, hand.curl); // open hand = spread fingers, fist = curl inward
    tipRefs.current.forEach((tip, i) => {
      if (!tip) return;
      const [ox, oy] = FINGER_OFFSETS[i];
      tip.position.x = lerp(tip.position.x, ox * spread, smooth);
      tip.position.y = lerp(tip.position.y, oy * spread, smooth);
    });
  });

  const color = highlighted ? "#ffe08a" : "#e0b088";

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color={color} emissive={highlighted ? "#c9962f" : "#000000"} emissiveIntensity={highlighted ? 0.6 : 0} />
      </mesh>
      {FINGER_OFFSETS.map((offset, i) => (
        <mesh key={i} ref={(el) => (tipRefs.current[i] = el)} position={[offset[0], offset[1], 0]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}
