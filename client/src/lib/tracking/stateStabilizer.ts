export interface StabilizerTuning {
  enter: number;
  exit: number;
  minHoldMs: number;
}

/**
 * Turns noisy per-frame candidate scores into a stable discrete state: smooths each candidate's
 * score over time (exponential smoothing), requires a new candidate to clearly beat the current
 * one (hysteresis: harder to enter than to leave), to keep winning for a bit (debounce), and
 * holds each state for a minimum duration once entered — so the output can't flicker between
 * states on per-frame tracking noise. Shared by expression classification and hand gesture
 * classification, which both need exactly this shape of noisy-signal-to-stable-label logic.
 */
export class DiscreteStateStabilizer<T extends string> {
  private smoothed: Partial<Record<T, number>> = {};
  private current: T;
  private currentSince = 0;
  private leadingCandidate: T;
  private leadingSince = 0;
  private lastUpdateTs: number | null = null;

  constructor(
    private idleLabel: T,
    private candidateLabels: readonly T[],
    private tuning: Record<T, StabilizerTuning>,
    private smoothingTauMs = 120,
    private debounceMs = 180
  ) {
    this.current = idleLabel;
    this.leadingCandidate = idleLabel;
    for (const label of candidateLabels) this.smoothed[label] = 0;
  }

  update(rawScores: Partial<Record<T, number>> | null, now: number): T {
    const dt = this.lastUpdateTs != null ? Math.max(0, now - this.lastUpdateTs) : 16;
    this.lastUpdateTs = now;
    const alpha = 1 - Math.exp(-dt / this.smoothingTauMs);

    for (const label of this.candidateLabels) {
      const target = rawScores?.[label] ?? 0;
      const prev = this.smoothed[label] ?? 0;
      this.smoothed[label] = prev + (target - prev) * alpha;
    }

    // Best candidate = highest smoothed score that clears its enter threshold; else idle.
    let best: T = this.idleLabel;
    let bestScore = this.tuning[this.idleLabel].enter;
    for (const label of this.candidateLabels) {
      const score = this.smoothed[label] ?? 0;
      if (score >= this.tuning[label].enter && score > bestScore) {
        best = label;
        bestScore = score;
      }
    }

    // Track how long `best` has consistently led, for debouncing.
    if (best !== this.leadingCandidate) {
      this.leadingCandidate = best;
      this.leadingSince = now;
    }
    const ledFor = now - this.leadingSince;

    if (best !== this.current) {
      const heldCurrentFor = now - this.currentSince;
      const currentWeakened = this.current === this.idleLabel || (this.smoothed[this.current] ?? 0) < this.tuning[this.current].exit;
      const candidateReady = ledFor >= this.debounceMs;
      const currentSatisfiedMinHold = heldCurrentFor >= this.tuning[this.current].minHoldMs;

      if (candidateReady && currentWeakened && currentSatisfiedMinHold) {
        this.current = best;
        this.currentSince = now;
      }
    }

    return this.current;
  }
}
