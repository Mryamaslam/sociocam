import type { ExpressionLabel } from "../../types/tracking";
import { blendshapeScore, clamp01, type BlendshapeCategory } from "./blendshapeUtils";
import { DiscreteStateStabilizer, type StabilizerTuning } from "./stateStabilizer";

type NonNeutralLabel = Exclude<ExpressionLabel, "neutral">;

const NON_NEUTRAL_LABELS: readonly NonNeutralLabel[] = ["smile", "laugh", "surprise", "sad", "angry", "confused", "blink", "wink"];

/** Rule-based match score per expression, 0..1, from MediaPipe's ARKit-style blendshapes. Not ML — good enough for stylized avatar-driving without a custom model. */
function scoreCandidates(categories: BlendshapeCategory[]): Record<NonNeutralLabel, number> {
  const s = (name: string) => blendshapeScore(categories, name);

  const smileAvg = (s("mouthSmileLeft") + s("mouthSmileRight")) / 2;
  const frownAvg = (s("mouthFrownLeft") + s("mouthFrownRight")) / 2;
  const jawOpen = s("jawOpen");
  const browInnerUp = s("browInnerUp");
  const browOuterUpL = s("browOuterUpLeft");
  const browOuterUpR = s("browOuterUpRight");
  const browDownAvg = (s("browDownLeft") + s("browDownRight")) / 2;
  const eyeWideAvg = (s("eyeWideLeft") + s("eyeWideRight")) / 2;
  const eyeBlinkL = s("eyeBlinkLeft");
  const eyeBlinkR = s("eyeBlinkRight");
  const pressAvg = (s("mouthPressLeft") + s("mouthPressRight")) / 2;
  const mouthShiftAvg = (s("mouthLeft") + s("mouthRight")) / 2;

  const blinkMax = Math.max(eyeBlinkL, eyeBlinkR);
  const blinkDiff = Math.abs(eyeBlinkL - eyeBlinkR);

  return {
    smile: clamp01(smileAvg - 0.3 * jawOpen),
    laugh: clamp01(Math.min(smileAvg, jawOpen) * 1.2),
    surprise: clamp01((browInnerUp + browOuterUpL + browOuterUpR) / 3 * 0.4 + jawOpen * 0.35 + eyeWideAvg * 0.25),
    sad: clamp01(frownAvg * 0.6 + browInnerUp * 0.4 - smileAvg * 0.5),
    angry: clamp01(browDownAvg * 0.6 + pressAvg * 0.4 - browInnerUp * 0.3),
    confused: clamp01(Math.max(Math.abs(browOuterUpL - browOuterUpR) * 2, mouthShiftAvg)),
    blink: clamp01(Math.min(eyeBlinkL, eyeBlinkR)),
    wink: blinkMax > 0.6 && blinkDiff > 0.4 ? clamp01(blinkDiff) : 0,
  };
}

const DEFAULT_TUNING: StabilizerTuning = { enter: 0.55, exit: 0.35, minHoldMs: 450 };

const TUNING: Record<ExpressionLabel, StabilizerTuning> = {
  neutral: { enter: 0, exit: 0, minHoldMs: 150 },
  smile: DEFAULT_TUNING,
  laugh: { enter: 0.55, exit: 0.35, minHoldMs: 450 },
  surprise: { enter: 0.5, exit: 0.3, minHoldMs: 400 },
  sad: { enter: 0.5, exit: 0.3, minHoldMs: 500 },
  angry: { enter: 0.5, exit: 0.3, minHoldMs: 500 },
  confused: { enter: 0.5, exit: 0.3, minHoldMs: 500 },
  blink: { enter: 0.6, exit: 0.3, minHoldMs: 80 },
  wink: { enter: 0.5, exit: 0.25, minHoldMs: 120 },
};

/** Turns noisy per-frame blendshape scores into a stable discrete expression — see DiscreteStateStabilizer. */
export class ExpressionStabilizer {
  private stabilizer = new DiscreteStateStabilizer<ExpressionLabel>("neutral", NON_NEUTRAL_LABELS, TUNING);

  update(categories: BlendshapeCategory[] | null, now: number): ExpressionLabel {
    return this.stabilizer.update(categories ? scoreCandidates(categories) : null, now);
  }
}
