import type { ExpressionLabel } from "../types/tracking";

/** Target mouth/eyebrow shape for each stabilized expression — the avatar eases toward these
 * rather than raw per-frame landmarks, so it reads as a clear, held expression instead of
 * noisy continuous motion. Eyes are intentionally NOT part of this: raw per-eye openness
 * already captures blink/wink laterality correctly (which eye), which a fixed preset can't —
 * baking in "left eye closes" would break a wink performed with the right eye. Head
 * orientation likewise stays driven directly from tracking, since it should feel immediate. */
export interface ExpressionPose {
  mouthOpen: number;
  mouthSmile: number;
  eyebrowRaise: number;
}

export const EXPRESSION_PRESETS: Record<ExpressionLabel, ExpressionPose> = {
  neutral: { mouthOpen: 0.05, mouthSmile: 0, eyebrowRaise: 0 },
  smile: { mouthOpen: 0.1, mouthSmile: 0.8, eyebrowRaise: 0.1 },
  laugh: { mouthOpen: 0.9, mouthSmile: 1, eyebrowRaise: 0.2 },
  surprise: { mouthOpen: 0.7, mouthSmile: 0.1, eyebrowRaise: 1 },
  sad: { mouthOpen: 0.1, mouthSmile: -0.7, eyebrowRaise: 0.3 },
  angry: { mouthOpen: 0.15, mouthSmile: -0.5, eyebrowRaise: -1 },
  confused: { mouthOpen: 0.1, mouthSmile: -0.15, eyebrowRaise: -0.3 },
  blink: { mouthOpen: 0.05, mouthSmile: 0, eyebrowRaise: 0 },
  wink: { mouthOpen: 0.1, mouthSmile: 0.4, eyebrowRaise: 0.1 },
};
