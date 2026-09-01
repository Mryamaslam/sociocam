export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Compact per-frame snapshot sent over the data channel. Keep this small — it goes over the wire ~20-30x/sec. */
export interface FaceState {
  /** 0 (closed) .. 1 (wide open) */
  mouthOpen: number;
  /** -1 (frown) .. 1 (smile) */
  mouthSmile: number;
  /** 0 (closed) .. 1 (open), per eye */
  leftEyeOpen: number;
  rightEyeOpen: number;
  /** -1 (furrowed) .. 1 (raised), average of both brows */
  eyebrowRaise: number;
  /** head orientation in radians */
  headYaw: number;
  headPitch: number;
  headRoll: number;
}

export type HandGestureLabel = "idle" | "wave" | "raised" | "point" | "grab";

export interface HandState {
  present: boolean;
  /** wrist position, normalized viewport space (0..1), z is relative depth from MediaPipe */
  wrist: Point3;
  /** 0 (straight/open) .. 1 (curled/fist), averaged across fingers. (Despite the name, higher = MORE curled — matches fingerCurl below.) */
  curl: number;
  /** per-finger curl, 0 (straight) .. 1 (curled) — needed to tell "point" (index out, rest curled) from a fist */
  fingerCurl: { index: number; middle: number; ring: number; pinky: number };
  /** Stabilized discrete gesture — see lib/tracking/handGestureClassifier.ts */
  gesture: HandGestureLabel;
}

export interface PoseState {
  present: boolean;
  leftShoulder: Point3;
  rightShoulder: Point3;
  /** -1 (leaning fully left) .. 1 (leaning fully right), from shoulder-midpoint vs hip-midpoint */
  torsoLean: number;
}

export type ExpressionLabel = "neutral" | "smile" | "laugh" | "surprise" | "sad" | "angry" | "confused" | "blink" | "wink";

export interface TrackingFrame {
  face: FaceState | null;
  /** Stabilized discrete expression — debounced/hysteresis-smoothed, see lib/tracking/expressionClassifier.ts */
  expression: ExpressionLabel;
  leftHand: HandState | null;
  rightHand: HandState | null;
  pose: PoseState | null;
  /**
   * 0 (still) .. 1 (fast/jittery) — smoothed magnitude of the active hand's recent motion.
   * A pure gameplay synchronization signal for "The Vase" (see game/vaseEngine.ts): how
   * closely two players' movement pace matches. This is NOT breath, heart rate, or any
   * physiological measurement — it's the same kind of signal a game controller's motion
   * sensor would give, derived only from hand position over time.
   */
  movementEnergy: number;
  timestamp: number;
}

export const NEUTRAL_FACE: FaceState = {
  mouthOpen: 0,
  mouthSmile: 0,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  eyebrowRaise: 0,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
};
