import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HandState } from "../types/tracking";
import { handWorldPosition } from "../avatar/handMapping";
import { LOCAL_AVATAR_POS, REMOTE_AVATAR_POS } from "../game/gestures";
import { useVaseStore } from "../state/vaseStore";

const TABLE_POSITION: [number, number, number] = [0, -1.3, 1.3];
const GRIP_FALLBACK: [number, number, number] = [0, -0.35, 0.35];

function vaseProfile(): THREE.Vector2[] {
  return [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.11, 0.01),
    new THREE.Vector2(0.15, 0.07),
    new THREE.Vector2(0.16, 0.14),
    new THREE.Vector2(0.13, 0.22),
    new THREE.Vector2(0.08, 0.28),
    new THREE.Vector2(0.09, 0.32),
    new THREE.Vector2(0.1, 0.33),
  ].map((v) => v.multiplyScalar(1.3));
}

const HEALTHY_COLOR = new THREE.Color("#c07a3e");
const CRACKED_COLOR = new THREE.Color("#8a2f2f");

interface ShardProps {
  seed: number;
  origin: readonly [number, number, number];
}

/** Tracks its own elapsed time via useFrame's delta — NOT a value computed once at the parent's
 * last render, which would freeze the animation mid-explosion since the parent only re-renders
 * on state changes, not every frame. */
function Shard({ seed, origin }: ShardProps) {
  const ref = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const rand = (n: number) => Math.sin(seed * 999 + n * 57.31) * 0.5 + 0.5;
  const vx = (rand(1) - 0.5) * 1.2;
  const vy = rand(2) * 1.5 + 0.4;
  const vz = (rand(3) - 0.5) * 1.2;

  useFrame((_, delta) => {
    if (!ref.current) return;
    elapsed.current += delta;
    const t = elapsed.current;
    ref.current.position.set(origin[0] + vx * t, origin[1] + vy * t - 2.2 * t * t, origin[2] + vz * t);
    ref.current.rotation.x += delta * 8;
    ref.current.rotation.y += delta * 6;
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    mat.opacity = Math.max(0, 1 - t / 1.1);
  });

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.04 + rand(4) * 0.03, 0.04 + rand(5) * 0.03, 0.04 + rand(6) * 0.03]} />
      <meshStandardMaterial color={CRACKED_COLOR} transparent opacity={1} />
    </mesh>
  );
}

interface VaseObjectProps {
  localHand: HandState | null;
  remoteHand: HandState | null;
}

export function VaseObject({ localHand, remoteHand }: VaseObjectProps) {
  const phase = useVaseStore((s) => s.phase);
  const progress = useVaseStore((s) => s.progress);
  const integrity = useVaseStore((s) => s.integrity);
  const instability = useVaseStore((s) => s.instability);

  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const profile = useMemo(vaseProfile, []);
  const shakePhase = useRef(0);
  // Last position before breaking — the shatter origin. A ref, not something computed inside
  // the "broken" render branch, because by the time that branch renders, the carrying-phase
  // group (and its position) is already gone — this is the only place that position survives.
  const lastPositionRef = useRef<[number, number, number]>(GRIP_FALLBACK);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    shakePhase.current += delta * 14;

    const local = localHand?.present ? handWorldPosition(LOCAL_AVATAR_POS, localHand) : null;
    const remote = remoteHand?.present ? handWorldPosition(REMOTE_AVATAR_POS, remoteHand) : null;
    const grip: [number, number, number] =
      local && remote
        ? [(local[0] + remote[0]) / 2, (local[1] + remote[1]) / 2, (local[2] + remote[2]) / 2]
        : local ?? remote ?? GRIP_FALLBACK;

    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const targetX = THREE.MathUtils.lerp(grip[0], TABLE_POSITION[0], t);
    const targetY = THREE.MathUtils.lerp(grip[1], TABLE_POSITION[1], t);
    const targetZ = THREE.MathUtils.lerp(grip[2], TABLE_POSITION[2], t);

    const wobbleBaseline = (1 - integrity) * 0.4;
    const shakeAmount = instability * 0.05 + wobbleBaseline * 0.03;
    const shakeX = Math.sin(shakePhase.current) * shakeAmount;
    const shakeZ = Math.cos(shakePhase.current * 1.3) * shakeAmount;

    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX + shakeX, 0.25);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.2);
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ + shakeZ, 0.25);
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      (instability * 0.35 + wobbleBaseline * 0.25) * Math.sin(shakePhase.current * 0.8),
      0.3
    );

    lastPositionRef.current = [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z];

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.copy(HEALTHY_COLOR).lerp(CRACKED_COLOR, 1 - integrity);
      const successGlow = phase === "success" ? 1 : 0;
      mat.emissive.setRGB(successGlow * 0.3, successGlow * 0.25, 0);
    }
  });

  if (phase === "idle") return null;

  if (phase === "broken") {
    return (
      <group>
        {Array.from({ length: 7 }, (_, i) => (
          <Shard key={i} seed={i + 1} origin={lastPositionRef.current} />
        ))}
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <latheGeometry args={[profile, 20]} />
        <meshStandardMaterial color={HEALTHY_COLOR} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function DestinationTable() {
  return (
    <group position={TABLE_POSITION}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.04, 20]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.46, 8]} />
        <meshStandardMaterial color="#3a2e20" />
      </mesh>
    </group>
  );
}
