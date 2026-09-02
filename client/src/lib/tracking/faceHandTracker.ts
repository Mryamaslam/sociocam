import {
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
  FilesetResolver,
  type Landmark,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { Hand as KalidokitHand } from "kalidokit";
import type { FaceState, HandState, PoseState, TrackingFrame } from "../../types/tracking";
import { blendshapeScore, clamp01, type BlendshapeCategory } from "./blendshapeUtils";
import { ExpressionStabilizer } from "./expressionClassifier";
import { HandGestureClassifier } from "./handGestureClassifier";
import { MovementEnergyTracker } from "./movementEnergy";

/** Kalidokit's proximal-joint angles come out in radians, roughly 0 (straight) .. ~1.6 (fully
 * curled) per its own geometric convention — normalize to this app's existing 0..1 curl scale so
 * `fingerBend` is a drop-in replacement for `fingerCurl` wherever a consumer wants the more
 * accurate value, not a differently-scaled number. */
function normalizeBendAngle(radians: number): number {
  return clamp01(radians / 1.6);
}

/** Runs Kalidokit's geometric hand solver over real 3D (world-space) landmarks and reduces its
 * detailed per-phalange output down to one proximal-joint bend per finger — the single biggest,
 * most visible joint, and the natural analog of the existing coarse `fingerCurl` value. Returns
 * null if Kalidokit can't solve this hand shape (e.g. a partially-occluded hand), so callers can
 * fall back to the distance-heuristic `fingerCurl` instead of showing a broken value. */
function solveFingerBend(worldLandmarks: Landmark[], side: "Left" | "Right"): HandState["fingerBend"] {
  const solved = KalidokitHand.solve(worldLandmarks, side);
  if (!solved) return null;
  const get = (key: string) => {
    const joint = (solved as Record<string, { z: number } | undefined>)[`${side}${key}`];
    return joint ? normalizeBendAngle(Math.abs(joint.z)) : 0;
  };
  return {
    index: get("IndexProximal"),
    middle: get("MiddleProximal"),
    ring: get("RingProximal"),
    pinky: get("LittleProximal"),
  };
}

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function fingerCurl(landmarks: NormalizedLandmark[], mcpIdx: number, tipIdx: number): number {
  const wrist = landmarks[0];
  const mcpDist = dist(landmarks[mcpIdx], wrist);
  const tipDist = dist(landmarks[tipIdx], wrist);
  if (mcpDist < 1e-6) return 0;
  return clamp01(1 - tipDist / (mcpDist * 2.2));
}

function buildHandState(
  landmarks: NormalizedLandmark[],
  worldLandmarks: Landmark[] | undefined,
  side: "Left" | "Right",
  classifier: HandGestureClassifier,
  now: number
): HandState {
  const wrist = landmarks[0];
  const fingerCurlValues = {
    index: fingerCurl(landmarks, 5, 8),
    middle: fingerCurl(landmarks, 9, 12),
    ring: fingerCurl(landmarks, 13, 16),
    pinky: fingerCurl(landmarks, 17, 20),
  };
  const curl = (fingerCurlValues.index + fingerCurlValues.middle + fingerCurlValues.ring + fingerCurlValues.pinky) / 4;
  const gesture = classifier.update(
    { present: true, wristX: wrist.x, wristY: wrist.y, fingerCurl: fingerCurlValues, avgCurl: curl },
    now
  );
  return {
    present: true,
    wrist: { x: wrist.x, y: wrist.y, z: wrist.z ?? 0 },
    curl,
    fingerCurl: fingerCurlValues,
    fingerBend: worldLandmarks ? solveFingerBend(worldLandmarks, side) : null,
    gesture,
  };
}

// BlazePose landmark indices, subject's own left/right (mirrored on a selfie camera).
const POSE_LEFT_SHOULDER = 11;
const POSE_RIGHT_SHOULDER = 12;
const POSE_LEFT_ELBOW = 13;
const POSE_RIGHT_ELBOW = 14;
const POSE_LEFT_HIP = 23;
const POSE_RIGHT_HIP = 24;

function poseStateFromLandmarks(landmarks: NormalizedLandmark[]): PoseState {
  // Swap left/right the same way hands are swapped, so the avatar's left arm matches the user's raised arm.
  const subjectLeftShoulder = landmarks[POSE_LEFT_SHOULDER];
  const subjectRightShoulder = landmarks[POSE_RIGHT_SHOULDER];
  const subjectLeftElbow = landmarks[POSE_LEFT_ELBOW];
  const subjectRightElbow = landmarks[POSE_RIGHT_ELBOW];
  const leftHip = landmarks[POSE_LEFT_HIP];
  const rightHip = landmarks[POSE_RIGHT_HIP];

  const shoulderMidX = (subjectLeftShoulder.x + subjectRightShoulder.x) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const shoulderSpan = Math.max(0.05, Math.abs(subjectLeftShoulder.x - subjectRightShoulder.x));
  const torsoLean = clamp01(0.5 + (shoulderMidX - hipMidX) / shoulderSpan) * 2 - 1;

  return {
    present: true,
    leftShoulder: { x: subjectRightShoulder.x, y: subjectRightShoulder.y, z: subjectRightShoulder.z ?? 0 },
    rightShoulder: { x: subjectLeftShoulder.x, y: subjectLeftShoulder.y, z: subjectLeftShoulder.z ?? 0 },
    leftElbow: { x: subjectRightElbow.x, y: subjectRightElbow.y, z: subjectRightElbow.z ?? 0 },
    rightElbow: { x: subjectLeftElbow.x, y: subjectLeftElbow.y, z: subjectLeftElbow.z ?? 0 },
    torsoLean,
  };
}

export type TrackerStatus = "loading" | "ready" | "error";

export class FaceHandTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private disposed = false;
  private expressionStabilizer = new ExpressionStabilizer();
  private leftHandGesture = new HandGestureClassifier();
  private rightHandGesture = new HandGestureClassifier();
  private movementEnergyTracker = new MovementEnergyTracker();

  async init(onStatus?: (status: TrackerStatus) => void): Promise<void> {
    onStatus?.("loading");
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        numFaces: 1,
      });
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      if (this.disposed) return;
      onStatus?.("ready");
    } catch (err) {
      console.error("FaceHandTracker init failed", err);
      onStatus?.("error");
      throw err;
    }
  }

  start(video: HTMLVideoElement, onFrame: (frame: TrackingFrame) => void): void {
    const loop = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(loop);
      if (!this.faceLandmarker || !this.handLandmarker || !this.poseLandmarker) return;
      if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;

      const now = performance.now();
      const faceResult = this.faceLandmarker.detectForVideo(video, now);
      const handResult = this.handLandmarker.detectForVideo(video, now);
      const poseResult = this.poseLandmarker.detectForVideo(video, now);
      const blendshapeCategories = faceResult.faceBlendshapes?.[0]?.categories ?? null;

      const frame: TrackingFrame = {
        face: this.extractFace(faceResult, blendshapeCategories),
        expression: this.expressionStabilizer.update(blendshapeCategories, now),
        leftHand: null,
        rightHand: null,
        pose: poseResult.landmarks?.[0] ? poseStateFromLandmarks(poseResult.landmarks[0]) : null,
        movementEnergy: 0,
        timestamp: now,
      };

      handResult.handednesses?.forEach((handedness, i) => {
        const label = handedness[0]?.categoryName as "Left" | "Right" | undefined; // MediaPipe's own
        // label: the REAL anatomical chirality of this landmark set (mirrored camera view) — Kalidokit
        // needs this exact value to correctly interpret thumb-side vs. pinky-side geometry, which is
        // independent of which avatar-facing slot (frame.leftHand/rightHand) this ends up stored in below.
        const landmarks = handResult.landmarks[i];
        if (!landmarks || !label) return;
        const worldLandmarks = handResult.worldLandmarks?.[i];
        if (label === "Left") {
          frame.rightHand = buildHandState(landmarks, worldLandmarks, label, this.rightHandGesture, now); // mirror for selfie view
        } else {
          frame.leftHand = buildHandState(landmarks, worldLandmarks, label, this.leftHandGesture, now);
        }
      });

      // Prefer the right hand as "the carrying hand" for movement energy — arbitrary but
      // consistent; falls back to the left hand, or decays toward stillness if neither is present.
      const activeHand = frame.rightHand ?? frame.leftHand;
      frame.movementEnergy = this.movementEnergyTracker.update(activeHand?.wrist.x ?? null, activeHand?.wrist.y ?? null, now);

      onFrame(frame);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private extractFace(result: ReturnType<FaceLandmarker["detectForVideo"]>, blendshapes: BlendshapeCategory[] | null): FaceState | null {
    if (!blendshapes) return null;

    const jawOpen = blendshapeScore(blendshapes, "jawOpen");
    const smileL = blendshapeScore(blendshapes, "mouthSmileLeft");
    const smileR = blendshapeScore(blendshapes, "mouthSmileRight");
    const frownL = blendshapeScore(blendshapes, "mouthFrownLeft");
    const frownR = blendshapeScore(blendshapes, "mouthFrownRight");
    const blinkL = blendshapeScore(blendshapes, "eyeBlinkLeft");
    const blinkR = blendshapeScore(blendshapes, "eyeBlinkRight");
    const browInnerUp = blendshapeScore(blendshapes, "browInnerUp");
    const browDownL = blendshapeScore(blendshapes, "browDownLeft");
    const browDownR = blendshapeScore(blendshapes, "browDownRight");

    let headYaw = 0;
    let headPitch = 0;
    let headRoll = 0;
    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    if (matrix && matrix.length === 16) {
      // matrix is column-major 4x4; extract rotation via atan2 on the rotation sub-matrix
      const m11 = matrix[0], m21 = matrix[1], m31 = matrix[2];
      const m32 = matrix[6], m33 = matrix[10];
      headYaw = Math.atan2(-m31, Math.hypot(m32, m33));
      headPitch = Math.atan2(m32, m33);
      headRoll = Math.atan2(m21, m11);
    }

    return {
      mouthOpen: clamp01(jawOpen),
      mouthSmile: clamp01((smileL + smileR) / 2) - clamp01((frownL + frownR) / 2),
      leftEyeOpen: clamp01(1 - blinkL),
      rightEyeOpen: clamp01(1 - blinkR),
      eyebrowRaise: clamp01(browInnerUp) - clamp01((browDownL + browDownR) / 2),
      headYaw,
      headPitch,
      headRoll,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.faceLandmarker?.close();
    this.handLandmarker?.close();
    this.poseLandmarker?.close();
    this.faceLandmarker = null;
    this.handLandmarker = null;
    this.poseLandmarker = null;
  }
}
