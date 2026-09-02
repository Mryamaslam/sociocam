import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { ExpressionLabel, FaceState, HandState, PoseState } from "../types/tracking";
import { NEUTRAL_FACE } from "../types/tracking";
import { EXPRESSION_PRESETS } from "./expressionPresets";
import { handWorldPosition, pointWorldPosition } from "./handMapping";

interface RealisticAvatarRigProps {
  url: string;
  position: readonly [number, number, number];
  face: FaceState | null;
  expression: ExpressionLabel;
  leftHand: HandState | null;
  rightHand: HandState | null;
  pose: PoseState | null;
  facingSign: 1 | -1;
  highlightHands?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Bone name candidates per logical joint. Every candidate is also tried with a "mixamorig:" /
// "mixamorig" prefix, since that's the other common convention (see TalkingHead's README, which
// documents both — this app's sample test avatar uses plain names, but not every export will).
const BONE_NAMES = {
  head: ["Head"],
  leftShoulder: ["LeftArm", "LeftShoulder"],
  rightShoulder: ["RightArm", "RightShoulder"],
  leftForeArm: ["LeftForeArm"],
  rightForeArm: ["RightForeArm"],
} as const;

const LEFT_FINGERS = ["LeftHandIndex", "LeftHandMiddle", "LeftHandRing", "LeftHandPinky"] as const;
const RIGHT_FINGERS = ["RightHandIndex", "RightHandMiddle", "RightHandRing", "RightHandPinky"] as const;

function findBone(root: THREE.Object3D, candidates: readonly string[]): THREE.Object3D | null {
  for (const name of candidates) {
    const found = root.getObjectByName(name) ?? root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(`mixamorig:${name}`);
    if (found) return found;
  }
  return null;
}

function collectMorphMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) meshes.push(mesh);
  });
  return meshes;
}

function setMorph(meshes: THREE.Mesh[], name: string, value: number) {
  for (const mesh of meshes) {
    const idx = mesh.morphTargetDictionary?.[name];
    if (idx !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = value;
  }
}

/** Per-morph-target exponential smoothing, so expression changes ease in over a couple hundred
 * ms instead of snapping instantly — the raw `setMorph` above has no memory of the previous
 * frame, which reads as jitter/popping whenever the discrete expression state changes. */
class MorphSmoother {
  private current = new Map<string, number>();

  apply(meshes: THREE.Mesh[], name: string, target: number, amount: number) {
    const prev = this.current.get(name) ?? target;
    const next = THREE.MathUtils.lerp(prev, target, amount);
    this.current.set(name, next);
    setMorph(meshes, name, next);
  }
}

/**
 * Aims `bone` at `targetWorld` using the bone's OWN rest-pose child direction as the reference —
 * not an assumed "arms point down" convention, which breaks across T-pose/A-pose/differently
 * modeled rigs. A child bone's `.position` is already expressed in the parent's local space in
 * three.js, so `child.position` (captured once, before any animation) *is* that rig's actual
 * rest direction for this bone, whatever the source rig's convention was.
 */
function aimBoneAt(bone: THREE.Object3D, restChildDir: THREE.Vector3, targetWorld: THREE.Vector3, amount: number) {
  const parent = bone.parent;
  if (!parent) return;
  const boneWorldPos = bone.getWorldPosition(new THREE.Vector3());
  const worldDir = targetWorld.clone().sub(boneWorldPos).normalize();
  const parentQuatWorld = parent.getWorldQuaternion(new THREE.Quaternion());
  const localDir = worldDir.clone().applyQuaternion(parentQuatWorld.clone().invert()).normalize();
  const targetQuat = new THREE.Quaternion().setFromUnitVectors(restChildDir, localDir);
  bone.quaternion.slerp(targetQuat, amount);
}

// Direction (not a magnitude — aimBoneAt only cares about the normalized direction from the
// bone to the target, so this works regardless of a given avatar's actual arm length or scale)
// for a natural standing rest pose: hanging down at the side, a little forward of straight down.
// Most uploaded GLBs' raw rest pose is a T-pose or A-pose — a convention for animation retargeting,
// not something that reads as a person standing still — so without tracked hand data the arm
// should relax to this instead of staying held out horizontally.
const ARM_REST_OFFSET = new THREE.Vector3(0, -1, 0.15);

/**
 * Drives a shoulder+forearm pair as an actual two-joint chain using the REAL tracked elbow
 * position, not a guess: the shoulder aims at the elbow, then (after propagating that rotation
 * down via updateWorldMatrix — react-three-fiber doesn't recompute world matrices until the
 * render pass, so reading the forearm's world position before this would use last frame's stale
 * shoulder orientation) the forearm aims at the hand from the elbow's now-current position. This
 * produces a genuine elbow bend, unlike aiming one rigid bone straight at the hand.
 *
 * Falls back to the old single-target approximation when the elbow reading isn't available this
 * frame (pose tracking momentarily lost while hand tracking isn't) — degraded, not broken. With
 * no hand tracked at all, relaxes toward the natural rest pose above instead of doing nothing.
 */
function driveArm(
  shoulderBone: THREE.Object3D | null,
  shoulderRestDir: THREE.Vector3,
  foreArmBone: THREE.Object3D | null,
  foreArmRestDir: THREE.Vector3,
  elbowWorld: THREE.Vector3 | null,
  handWorld: THREE.Vector3 | null,
  amount: number
) {
  if (!shoulderBone) return;
  if (!handWorld) {
    const restTarget = shoulderBone.getWorldPosition(new THREE.Vector3()).add(ARM_REST_OFFSET);
    aimBoneAt(shoulderBone, shoulderRestDir, restTarget, amount);
    shoulderBone.updateWorldMatrix(true, false);
    if (foreArmBone) aimBoneAt(foreArmBone, foreArmRestDir, restTarget, amount);
    return;
  }
  if (elbowWorld) {
    aimBoneAt(shoulderBone, shoulderRestDir, elbowWorld, amount);
    shoulderBone.updateWorldMatrix(true, false);
    if (foreArmBone) aimBoneAt(foreArmBone, foreArmRestDir, handWorld, amount);
  } else {
    aimBoneAt(shoulderBone, shoulderRestDir, handWorld, amount);
    shoulderBone.updateWorldMatrix(true, false);
    if (foreArmBone) aimBoneAt(foreArmBone, foreArmRestDir, handWorld, amount * 0.5);
  }
}

export function RealisticAvatarRig({ url, position, face, expression, leftHand, rightHand, pose, facingSign, highlightHands }: RealisticAvatarRigProps) {
  const { scene } = useGLTF(url);
  // Clone per-instance — two avatars must never share one scene graph (two players using the
  // same uploaded model, or the same model in both the live room and the customizer preview).
  // Plain Object3D.clone(true) does NOT correctly clone SkinnedMesh/skeleton bindings — the
  // clone ends up bound to the ORIGINAL scene's bones, silently producing wrong bounding boxes
  // and broken deformation. SkeletonUtils.clone is three.js's own fix for exactly this.
  const model = useMemo(() => SkeletonUtils.clone(scene) as THREE.Object3D, [scene]);
  const morphMeshes = useMemo(() => collectMorphMeshes(model), [model]);
  const groupRef = useRef<THREE.Group>(null);

  // Auto-fit: uploaded avatars can be modeled in any scale/unit convention (real-world meters,
  // arbitrary units, feet-at-origin or centered-at-origin...). Rather than assume one, measure
  // the model's actual bounding box and scale/reposition it to match this scene's existing
  // scale (the procedural avatar's rough footprint) — robust to whatever a user uploads, not
  // just the one sample file this was tested against.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 1.9;
    const scale = size.y > 0.01 ? targetHeight / size.y : 1;
    const feetY = box.min.y * scale;
    const centerX = ((box.min.x + box.max.x) / 2) * scale;
    const centerZ = ((box.min.z + box.max.z) / 2) * scale;
    return { scale, offset: [-centerX, -1.5 - feetY, -centerZ] as [number, number, number] };
  }, [model]);

  const headBone = useMemo(() => findBone(model, BONE_NAMES.head), [model]);
  const leftShoulderBone = useMemo(() => findBone(model, BONE_NAMES.leftShoulder), [model]);
  const rightShoulderBone = useMemo(() => findBone(model, BONE_NAMES.rightShoulder), [model]);
  const leftForeArmBone = useMemo(() => findBone(model, BONE_NAMES.leftForeArm), [model]);
  const rightForeArmBone = useMemo(() => findBone(model, BONE_NAMES.rightForeArm), [model]);

  const restChildDir = (bone: THREE.Object3D | null, fallback: THREE.Vector3) => {
    const child = bone?.children.find((c) => (c as any).isBone || c.type === "Bone");
    return child ? child.position.clone().normalize() : fallback;
  };
  const leftShoulderRestDir = useMemo(() => restChildDir(leftShoulderBone, new THREE.Vector3(1, 0, 0)), [leftShoulderBone]);
  const rightShoulderRestDir = useMemo(() => restChildDir(rightShoulderBone, new THREE.Vector3(-1, 0, 0)), [rightShoulderBone]);
  const leftForeArmRestDir = useMemo(() => restChildDir(leftForeArmBone, new THREE.Vector3(1, 0, 0)), [leftForeArmBone]);
  const rightForeArmRestDir = useMemo(() => restChildDir(rightForeArmBone, new THREE.Vector3(-1, 0, 0)), [rightForeArmBone]);

  const morphSmoother = useRef(new MorphSmoother());

  const fingerBones = useMemo(() => {
    const build = (names: readonly string[]) =>
      names.map((finger) => [1, 2, 3].map((i) => findBone(model, [`${finger}${i}`])).filter((b): b is THREE.Object3D => !!b));
    return { left: build(LEFT_FINGERS), right: build(RIGHT_FINGERS) };
  }, [model]);

  // Highlight (hold-hands glow) — tint any hand/arm-adjacent mesh material subtly. Kept minimal:
  // a full material-swap system is more than a Phase A hold-hands cue needs.
  useEffect(() => {
    if (!highlightHands) return;
    // Intentionally a no-op beyond the prop existing — see README known gaps: the realistic
    // avatar doesn't yet get the same hold-hands glow the procedural one does.
  }, [highlightHands]);

  useFrame((_, delta) => {
    const f = face ?? NEUTRAL_FACE;
    const preset = EXPRESSION_PRESETS[expression];
    const morph = morphSmoother.current;
    // ~150ms time constant for expression morphs — fast enough to feel responsive, slow enough
    // that a discrete expression-state change eases in instead of popping.
    const morphAmount = 1 - Math.pow(0.001, delta);
    // Eyes get a snappier constant — real blinks are fast, over-smoothing them reads as the
    // avatar's eyes being sluggish/half-closed rather than actually blinking.
    const eyeAmount = 1 - Math.pow(0.02, delta);

    const smile = clamp01(preset.mouthSmile);
    const frown = clamp01(-preset.mouthSmile);
    const browUp = clamp01(preset.eyebrowRaise);
    const browDown = clamp01(-preset.eyebrowRaise);

    morph.apply(morphMeshes, "jawOpen", preset.mouthOpen, morphAmount);
    morph.apply(morphMeshes, "mouthClose", clamp01(1 - preset.mouthOpen) * 0.3, morphAmount);
    morph.apply(morphMeshes, "mouthSmileLeft", smile, morphAmount);
    morph.apply(morphMeshes, "mouthSmileRight", smile, morphAmount);
    morph.apply(morphMeshes, "mouthFrownLeft", frown, morphAmount);
    morph.apply(morphMeshes, "mouthFrownRight", frown, morphAmount);
    morph.apply(morphMeshes, "browInnerUp", browUp, morphAmount);
    morph.apply(morphMeshes, "browOuterUpLeft", browUp * 0.7, morphAmount);
    morph.apply(morphMeshes, "browOuterUpRight", browUp * 0.7, morphAmount);
    morph.apply(morphMeshes, "browDownLeft", browDown, morphAmount);
    morph.apply(morphMeshes, "browDownRight", browDown, morphAmount);
    // A genuine smile squints the eyes slightly — a small authenticity touch from a signal we
    // already have, not a new tracking input.
    morph.apply(morphMeshes, "eyeSquintLeft", smile * 0.3, morphAmount);
    morph.apply(morphMeshes, "eyeSquintRight", smile * 0.3, morphAmount);
    // Eyes stay off the preset and read raw per-eye values directly — same reasoning as the
    // procedural avatar: blink/wink laterality only exists in the raw signal.
    morph.apply(morphMeshes, "eyeBlinkLeft", clamp01(1 - f.leftEyeOpen), eyeAmount);
    morph.apply(morphMeshes, "eyeBlinkRight", clamp01(1 - f.rightEyeOpen), eyeAmount);

    if (headBone) {
      const targetEuler = new THREE.Euler(f.headPitch, f.headYaw * facingSign, f.headRoll * facingSign);
      const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);
      headBone.quaternion.slerp(targetQuat, 1 - Math.pow(0.001, delta));
    }

    const aimAmount = 1 - Math.pow(0.0001, delta);
    const leftHandTarget = leftHand?.present ? new THREE.Vector3(...handWorldPosition(position, leftHand)) : null;
    const rightHandTarget = rightHand?.present ? new THREE.Vector3(...handWorldPosition(position, rightHand)) : null;
    const leftElbowTarget = pose?.present ? new THREE.Vector3(...pointWorldPosition(position, pose.leftElbow)) : null;
    const rightElbowTarget = pose?.present ? new THREE.Vector3(...pointWorldPosition(position, pose.rightElbow)) : null;
    driveArm(leftShoulderBone, leftShoulderRestDir, leftForeArmBone, leftForeArmRestDir, leftElbowTarget, leftHandTarget, aimAmount);
    driveArm(rightShoulderBone, rightShoulderRestDir, rightForeArmBone, rightForeArmRestDir, rightElbowTarget, rightHandTarget, aimAmount);

    // Per-finger bend — prefers Kalidokit's geometrically-solved proximal-joint angle
    // (`fingerBend`) when this frame has one, falling back to the coarser distance-heuristic
    // `fingerCurl` otherwise (manual-mode frames, or a hand shape Kalidokit couldn't solve).
    // Bend axis is still a reasonable default (local X) rather than measured per-rig — see
    // README known gaps — but the bend AMOUNT itself is now real geometry, not a guess.
    const applyCurl = (chains: THREE.Object3D[][], hand: HandState | null) => {
      if (!hand?.present) return;
      const bend = hand.fingerBend ?? hand.fingerCurl;
      const curls = [bend.index, bend.middle, bend.ring, bend.pinky];
      chains.forEach((chain, i) => {
        const angle = curls[i] * 1.1;
        for (const bone of chain) bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, angle, aimAmount);
      });
    };
    applyCurl(fingerBones.left, leftHand);
    applyCurl(fingerBones.right, rightHand);
  });

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = facingSign === 1 ? 0 : Math.PI;
    }
  }, [facingSign]);

  return (
    <group ref={groupRef} position={position as [number, number, number]}>
      <group scale={fit.scale} position={fit.offset}>
        <primitive object={model} />
      </group>
    </group>
  );
}
