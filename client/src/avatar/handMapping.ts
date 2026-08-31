import type { HandState } from "../types/tracking";

/**
 * Maps a normalized camera-space wrist position onto a plane in front of the avatar's torso,
 * in world space. Shared by the hand renderer and the hold-hands/gesture proximity checks so
 * both agree on where a hand "is".
 */
export function handWorldPosition(avatarPosition: readonly [number, number, number], hand: HandState): [number, number, number] {
  const localX = (0.5 - hand.wrist.x) * 1.6;
  const localY = (0.5 - hand.wrist.y) * 1.6 - 0.5;
  const localZ = 0.5 - hand.wrist.z * 1.2;
  return [avatarPosition[0] + localX, avatarPosition[1] + localY, avatarPosition[2] + localZ];
}

export function distance3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
