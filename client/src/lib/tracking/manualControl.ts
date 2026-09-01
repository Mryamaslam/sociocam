import type { ExpressionLabel, FaceState, HandGestureLabel, HandState, TrackingFrame } from "../../types/tracking";

/**
 * Builds a synthetic tracking frame from a manually chosen expression/gesture — the fallback
 * control path for when camera tracking isn't available (denied permission, unsupported
 * device, model failed to load). It flows through the exact same avatar-rendering and
 * data-channel pipeline as camera-driven frames, so nothing downstream needs to know the
 * difference between "the camera saw a smile" and "the user clicked the smile button."
 */
export function buildManualFrame(expression: ExpressionLabel, gesture: HandGestureLabel): TrackingFrame {
  const face: FaceState = {
    mouthOpen: 0,
    mouthSmile: 0,
    eyebrowRaise: 0,
    // Mouth/eyebrow shape comes from the `expression` preset downstream (see expressionPresets.ts),
    // but eye-openness is read directly from here, so blink/wink need to be set explicitly.
    leftEyeOpen: expression === "blink" || expression === "wink" ? 0.05 : 1,
    rightEyeOpen: expression === "blink" ? 0.05 : 1,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
  };

  const activeHand: HandState | null =
    gesture === "idle"
      ? null
      : {
          present: true,
          wrist: { x: 0.35, y: gesture === "raised" ? 0.2 : 0.5, z: 0 },
          curl: gesture === "grab" ? 0.9 : gesture === "point" ? 0.55 : 0.15,
          fingerCurl:
            gesture === "point"
              ? { index: 0.1, middle: 0.9, ring: 0.9, pinky: 0.9 }
              : gesture === "grab"
                ? { index: 0.9, middle: 0.9, ring: 0.9, pinky: 0.9 }
                : { index: 0.15, middle: 0.15, ring: 0.15, pinky: 0.15 },
          gesture,
        };

  return {
    face,
    expression,
    leftHand: null,
    rightHand: activeHand,
    pose: null,
    // Fixed moderate value while a hand gesture is active, so manual-mode players can still
    // participate in "The Vase" — real per-frame motion obviously isn't available here.
    movementEnergy: gesture === "idle" ? 0 : 0.4,
    timestamp: performance.now(),
  };
}
