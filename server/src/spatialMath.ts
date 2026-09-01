// Mirrors client/src/avatar/handMapping.ts + game/gestures.ts constants — duplicated on purpose
// (no shared package between the two workspaces). This is what makes the server an actual
// authority on hand-hold/high-five rather than a pass-through: it does the SAME proximity math
// the client does, independently, on whatever hand positions each client reports about itself.

export type Vec3 = [number, number, number];

// Member[0] (room creator) and member[1] (joiner) get a fixed canonical world position each —
// arbitrary but consistent, matching the fact that each client also renders itself and its
// peer at a fixed pair of spots. The server doesn't need to match any client's camera view,
// only to be internally consistent so "close" means the same thing every time it's evaluated.
export const MEMBER_POSITIONS: [Vec3, Vec3] = [
  [-0.7, 0, 0],
  [0.7, 0, 0],
];

export interface HandPosition {
  x: number;
  y: number;
  z: number;
}

export function handWorldPosition(avatarPosition: Vec3, hand: HandPosition): Vec3 {
  const localX = (0.5 - hand.x) * 1.6;
  const localY = (0.5 - hand.y) * 1.6 - 0.5;
  const localZ = 0.5 - hand.z * 1.2;
  return [avatarPosition[0] + localX, avatarPosition[1] + localY, avatarPosition[2] + localZ];
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
