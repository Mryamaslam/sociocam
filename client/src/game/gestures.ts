import type { HandState, TrackingFrame } from "../types/tracking";
import { distance3, handWorldPosition } from "../avatar/handMapping";
import type { GestureKind } from "./protocol";

export const LOCAL_AVATAR_POS: readonly [number, number, number] = [-0.7, 0, 0];
export const REMOTE_AVATAR_POS: readonly [number, number, number] = [0.7, 0, 0];
export const HOLD_HANDS_DISTANCE = 0.6;

function handLifted(hand: HandState | null): boolean {
  return !!hand?.present && hand.wrist.y < 0.4;
}

function handOpen(hand: HandState | null): boolean {
  return !!hand?.present && hand.curl < 0.3;
}

function frameSatisfiesSimpleGesture(frame: TrackingFrame | null, gesture: Exclude<GestureKind, "hold-hands">): boolean {
  if (!frame) return false;
  switch (gesture) {
    case "smile":
      return (frame.face?.mouthSmile ?? -1) > 0.35;
    case "raise-hand":
      return handLifted(frame.leftHand) || handLifted(frame.rightHand);
    case "open-palms":
      return handOpen(frame.leftHand) && handOpen(frame.rightHand);
  }
}

export function handsAreHeld(local: TrackingFrame | null, remote: TrackingFrame | null): boolean {
  if (!local || !remote) return false;
  const localHands = [local.leftHand, local.rightHand].filter((h): h is HandState => !!h?.present);
  const remoteHands = [remote.leftHand, remote.rightHand].filter((h): h is HandState => !!h?.present);
  for (const lh of localHands) {
    const lp = handWorldPosition(LOCAL_AVATAR_POS, lh);
    for (const rh of remoteHands) {
      const rp = handWorldPosition(REMOTE_AVATAR_POS, rh);
      if (distance3(lp, rp) < HOLD_HANDS_DISTANCE) return true;
    }
  }
  return false;
}

export function bothSatisfyGesture(local: TrackingFrame | null, remote: TrackingFrame | null, gesture: GestureKind): boolean {
  if (gesture === "hold-hands") return handsAreHeld(local, remote);
  return frameSatisfiesSimpleGesture(local, gesture) && frameSatisfiesSimpleGesture(remote, gesture);
}
