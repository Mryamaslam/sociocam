import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FaceState, HandState, PoseState, ExpressionLabel } from "../types/tracking";
import { NEUTRAL_FACE } from "../types/tracking";
import { HandRig } from "./HandRig";
import { handWorldPosition } from "./handMapping";
import { EXPRESSION_PRESETS } from "./expressionPresets";
import type { AvatarConfig } from "./avatarOptions";

interface AvatarRigProps {
  position: readonly [number, number, number];
  face: FaceState | null;
  expression: ExpressionLabel;
  leftHand: HandState | null;
  rightHand: HandState | null;
  pose: PoseState | null;
  avatarConfig: AvatarConfig;
  facingSign: 1 | -1;
  highlightHands?: boolean;
}

const lerp = THREE.MathUtils.lerp;
const LEFT_SHOULDER_ANCHOR: [number, number, number] = [-0.22, -0.05, 0.05];
const RIGHT_SHOULDER_ANCHOR: [number, number, number] = [0.22, -0.05, 0.05];

function updateLimb(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.001, dir.length());
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

export function AvatarRig({ position, face, expression, leftHand, rightHand, pose, avatarConfig, facingSign, highlightHands }: AvatarRigProps) {
  const bodyGroupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftBrowRef = useRef<THREE.Mesh>(null);
  const rightBrowRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const scratchFrom = useRef(new THREE.Vector3());
  const scratchTo = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const f = face ?? NEUTRAL_FACE;
    const pose_ = EXPRESSION_PRESETS[expression];
    const smooth = 1 - Math.pow(0.001, delta); // frame-rate independent easing

    if (headRef.current) {
      headRef.current.rotation.y = lerp(headRef.current.rotation.y, f.headYaw * facingSign, smooth);
      headRef.current.rotation.x = lerp(headRef.current.rotation.x, f.headPitch, smooth);
      headRef.current.rotation.z = lerp(headRef.current.rotation.z, f.headRoll * facingSign, smooth);
    }
    if (jawRef.current) {
      const openAmount = 0.05 + pose_.mouthOpen * 0.22;
      jawRef.current.scale.y = lerp(jawRef.current.scale.y, openAmount, smooth);
      jawRef.current.scale.x = lerp(jawRef.current.scale.x, 1 + pose_.mouthSmile * 0.35, smooth);
      jawRef.current.position.y = lerp(jawRef.current.position.y, -0.32 - pose_.mouthOpen * 0.1 + pose_.mouthSmile * 0.02, smooth);
    }
    // Eyes stay driven from raw per-eye values (not the expression preset) — blink/wink laterality
    // (which eye) only exists in the raw signal; a preset can't say "the left eye" vs "the right eye".
    if (leftEyeRef.current) leftEyeRef.current.scale.y = lerp(leftEyeRef.current.scale.y, Math.max(0.05, f.leftEyeOpen), smooth);
    if (rightEyeRef.current) rightEyeRef.current.scale.y = lerp(rightEyeRef.current.scale.y, Math.max(0.05, f.rightEyeOpen), smooth);
    if (leftBrowRef.current) leftBrowRef.current.position.y = lerp(leftBrowRef.current.position.y, 0.22 + pose_.eyebrowRaise * 0.08, smooth);
    if (rightBrowRef.current) rightBrowRef.current.position.y = lerp(rightBrowRef.current.position.y, 0.22 + pose_.eyebrowRaise * 0.08, smooth);

    if (bodyGroupRef.current) {
      const lean = pose?.present ? pose.torsoLean * facingSign : 0;
      bodyGroupRef.current.rotation.z = lerp(bodyGroupRef.current.rotation.z, lean * 0.25, smooth);
      bodyGroupRef.current.position.x = lerp(bodyGroupRef.current.position.x, lean * 0.15, smooth);
    }

    // Arm meshes are children of the avatar's own translated group, so everything here is in
    // that group's LOCAL space — subtract `position` from any world-space target (e.g. from handWorldPosition).
    if (leftArmRef.current) {
      const anchor = LEFT_SHOULDER_ANCHOR;
      const worldTarget = leftHand?.present ? handWorldPosition(position, leftHand) : null;
      const localTarget: [number, number, number] = worldTarget
        ? [worldTarget[0] - position[0], worldTarget[1] - position[1], worldTarget[2] - position[2]]
        : [anchor[0], anchor[1] - 0.35, anchor[2]];
      scratchFrom.current.set(anchor[0], anchor[1], anchor[2]);
      scratchTo.current.set(...localTarget);
      updateLimb(leftArmRef.current, scratchFrom.current, scratchTo.current);
    }
    if (rightArmRef.current) {
      const anchor = RIGHT_SHOULDER_ANCHOR;
      const worldTarget = rightHand?.present ? handWorldPosition(position, rightHand) : null;
      const localTarget: [number, number, number] = worldTarget
        ? [worldTarget[0] - position[0], worldTarget[1] - position[1], worldTarget[2] - position[2]]
        : [anchor[0], anchor[1] - 0.35, anchor[2]];
      scratchFrom.current.set(anchor[0], anchor[1], anchor[2]);
      scratchTo.current.set(...localTarget);
      updateLimb(rightArmRef.current, scratchFrom.current, scratchTo.current);
    }
  });

  const { skinColor, hairStyle, hairColor, eyeColor, clothingColor, accessory } = avatarConfig;

  return (
    <group position={position as [number, number, number]}>
      {/* arms are drawn in world space (siblings of the body group) since they connect to hands positioned in world space */}
      <mesh ref={leftArmRef}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      <mesh ref={rightArmRef}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      <group ref={bodyGroupRef}>
        {/* body / clothing */}
        <mesh position={[0, -0.9, 0]}>
          <capsuleGeometry args={[0.32, 0.6, 8, 16]} />
          <meshStandardMaterial color={clothingColor} />
        </mesh>

        {/* head */}
        <group ref={headRef} position={[0, 0.05, 0]}>
          <mesh>
            <sphereGeometry args={[0.4, 32, 32]} />
            <meshStandardMaterial color={skinColor} />
          </mesh>

          {/* hair */}
          {hairStyle !== "bald" && (
            <mesh position={[0, 0.02, 0]}>
              <sphereGeometry args={[0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              <meshStandardMaterial color={hairColor} />
            </mesh>
          )}
          {hairStyle === "long" && (
            <mesh position={[0, -0.15, -0.22]}>
              <boxGeometry args={[0.4, 0.5, 0.12]} />
              <meshStandardMaterial color={hairColor} />
            </mesh>
          )}
          {hairStyle === "ponytail" && (
            <mesh position={[0, 0.02, -0.42]} rotation={[Math.PI / 2.3, 0, 0]}>
              <capsuleGeometry args={[0.06, 0.3, 4, 8]} />
              <meshStandardMaterial color={hairColor} />
            </mesh>
          )}

          {/* accessories — pushed well clear of the head sphere's surface (radius 0.4) so they
              don't get swallowed by it; the sphere's surface recedes fast near the front, so
              "clear of the surface at center" isn't clear of it a few cm to the side. */}
          {accessory === "glasses" && (
            <group position={[0, 0.05, 0.42]}>
              <mesh position={[-0.15, 0, 0]}>
                <torusGeometry args={[0.09, 0.025, 8, 16]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
              <mesh position={[0.15, 0, 0]}>
                <torusGeometry args={[0.09, 0.025, 8, 16]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.12, 0.02, 0.02]} />
                <meshStandardMaterial color="#1a1a1a" />
              </mesh>
            </group>
          )}
          {accessory === "hat" && (
            // Brim rests right at the head's top surface (y=0.4 in this local space); the cone
            // rises from there, instead of being centered on the head and mostly buried in it.
            <group position={[0, 0.42, 0]}>
              <mesh position={[0, 0.15, 0]}>
                <coneGeometry args={[0.26, 0.3, 16]} />
                <meshStandardMaterial color={clothingColor} />
              </mesh>
              <mesh>
                <cylinderGeometry args={[0.36, 0.36, 0.04, 16]} />
                <meshStandardMaterial color={clothingColor} />
              </mesh>
            </group>
          )}

          {/* eyes */}
          <mesh ref={leftEyeRef} position={[-0.15, 0.05, 0.35]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color={eyeColor} />
          </mesh>
          <mesh ref={rightEyeRef} position={[0.15, 0.05, 0.35]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color={eyeColor} />
          </mesh>

          {/* eyebrows */}
          <mesh ref={leftBrowRef} position={[-0.15, 0.22, 0.36]}>
            <boxGeometry args={[0.14, 0.03, 0.03]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>
          <mesh ref={rightBrowRef} position={[0.15, 0.22, 0.36]}>
            <boxGeometry args={[0.14, 0.03, 0.03]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>

          {/* jaw / mouth */}
          <mesh ref={jawRef} position={[0, -0.32, 0.3]}>
            <boxGeometry args={[0.2, 0.08, 0.05]} />
            <meshStandardMaterial color="#7a3b3b" />
          </mesh>
        </group>
      </group>

      <HandRig hand={leftHand} avatarPosition={position} highlighted={highlightHands} />
      <HandRig hand={rightHand} avatarPosition={position} highlighted={highlightHands} />
    </group>
  );
}
