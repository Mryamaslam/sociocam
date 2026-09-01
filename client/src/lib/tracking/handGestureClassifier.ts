import type { HandGestureLabel } from "../../types/tracking";
import { clamp01 } from "./blendshapeUtils";
import { DiscreteStateStabilizer, type StabilizerTuning } from "./stateStabilizer";

type NonIdleLabel = Exclude<HandGestureLabel, "idle">;
const NON_IDLE_LABELS: readonly NonIdleLabel[] = ["wave", "raised", "point", "grab"];

const TUNING: Record<HandGestureLabel, StabilizerTuning> = {
  idle: { enter: 0, exit: 0, minHoldMs: 100 },
  wave: { enter: 0.5, exit: 0.3, minHoldMs: 200 },
  raised: { enter: 0.5, exit: 0.3, minHoldMs: 250 },
  point: { enter: 0.55, exit: 0.35, minHoldMs: 300 },
  grab: { enter: 0.55, exit: 0.35, minHoldMs: 250 },
};

const WAVE_WINDOW_MS = 1000;

interface HistoryEntry {
  x: number;
  t: number;
}

/** Detects a side-to-side wave from recent wrist-x history: needs at least 2 direction reversals with real amplitude within the last second — a single swipe or natural hand jitter won't trigger it. */
class WaveDetector {
  private history: HistoryEntry[] = [];

  score(x: number, now: number): number {
    this.history.push({ x, t: now });
    this.history = this.history.filter((h) => now - h.t <= WAVE_WINDOW_MS);
    if (this.history.length < 4) return 0;

    let reversals = 0;
    let minX = this.history[0].x;
    let maxX = this.history[0].x;
    let prevDir = 0;
    for (let i = 1; i < this.history.length; i++) {
      const dx = this.history[i].x - this.history[i - 1].x;
      const dir = dx > 0.005 ? 1 : dx < -0.005 ? -1 : 0;
      if (dir !== 0 && prevDir !== 0 && dir !== prevDir) reversals++;
      if (dir !== 0) prevDir = dir;
      minX = Math.min(minX, this.history[i].x);
      maxX = Math.max(maxX, this.history[i].x);
    }
    const amplitude = maxX - minX;
    if (reversals < 2 || amplitude < 0.06) return 0;
    return clamp01(amplitude * 4);
  }

  reset(): void {
    this.history = [];
  }
}

export interface HandGestureInput {
  present: boolean;
  wristX: number;
  wristY: number;
  fingerCurl: { index: number; middle: number; ring: number; pinky: number };
  avgCurl: number;
}

/** One instance per hand — wave detection needs its own motion history per hand. */
export class HandGestureClassifier {
  private stabilizer = new DiscreteStateStabilizer<HandGestureLabel>("idle", NON_IDLE_LABELS, TUNING);
  private waveDetector = new WaveDetector();

  update(input: HandGestureInput | null, now: number): HandGestureLabel {
    if (!input?.present) {
      this.waveDetector.reset();
      return this.stabilizer.update(null, now);
    }

    const waveScore = this.waveDetector.score(input.wristX, now);
    const raisedScore = input.wristY < 0.4 ? clamp01((0.4 - input.wristY) / 0.4) : 0;
    const pointScore =
      input.fingerCurl.index < 0.35
        ? clamp01((0.35 - input.fingerCurl.index) * 2) *
          clamp01(((input.fingerCurl.middle + input.fingerCurl.ring + input.fingerCurl.pinky) / 3 - 0.4) * 2)
        : 0;
    const grabScore = clamp01((input.avgCurl - 0.55) * 2.2);

    return this.stabilizer.update({ wave: waveScore, raised: raisedScore, point: pointScore, grab: grabScore }, now);
  }
}
