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

export interface HandState {
  present: boolean;
  /** wrist position, normalized viewport space (0..1), z is relative depth from MediaPipe */
  wrist: Point3;
  /** 0 (fist) .. 1 (fully spread) */
  curl: number;
}

export interface PoseState {
  present: boolean;
  leftShoulder: Point3;
  rightShoulder: Point3;
  /** -1 (leaning fully left) .. 1 (leaning fully right), from shoulder-midpoint vs hip-midpoint */
  torsoLean: number;
}

export interface TrackingFrame {
  face: FaceState | null;
  leftHand: HandState | null;
  rightHand: HandState | null;
  pose: PoseState | null;
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
