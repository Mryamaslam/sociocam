import { clamp01 } from "./blendshapeUtils";

const SMOOTHING_TAU_MS = 200;
const MAX_SPEED_PER_SEC = 2.2; // normalized-coords/sec that maps to energy = 1; tuned for a brisk hand wave

/**
 * Turns raw hand position over time into a smoothed 0..1 "movement energy" value — how much a
 * player's carrying hand is moving right now. Purely a gameplay signal (see TrackingFrame.
 * movementEnergy): the same category of thing a controller's accelerometer would give a game,
 * not any kind of physiological reading.
 */
export class MovementEnergyTracker {
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastT: number | null = null;
  private smoothed = 0;

  update(handX: number | null, handY: number | null, now: number): number {
    if (handX == null || handY == null) {
      // No hand present — decay toward stillness rather than snapping, so a brief tracking
      // dropout doesn't look like the player suddenly stopped dead.
      const dt = this.lastT != null ? Math.max(0, now - this.lastT) : 16;
      this.lastT = now;
      this.lastX = null;
      this.lastY = null;
      const alpha = 1 - Math.exp(-dt / SMOOTHING_TAU_MS);
      this.smoothed = this.smoothed + (0 - this.smoothed) * alpha;
      return this.smoothed;
    }

    if (this.lastX == null || this.lastY == null || this.lastT == null) {
      this.lastX = handX;
      this.lastY = handY;
      this.lastT = now;
      return this.smoothed;
    }

    const dt = Math.max(1, now - this.lastT);
    const dist = Math.hypot(handX - this.lastX, handY - this.lastY);
    const speed = dist / (dt / 1000); // normalized-coords per second
    const instant = clamp01(speed / MAX_SPEED_PER_SEC);

    const alpha = 1 - Math.exp(-dt / SMOOTHING_TAU_MS);
    this.smoothed = this.smoothed + (instant - this.smoothed) * alpha;

    this.lastX = handX;
    this.lastY = handY;
    this.lastT = now;
    return this.smoothed;
  }
}
