import type { HandState, TrackingFrame } from "../types/tracking";
import { distance3, handWorldPosition } from "../avatar/handMapping";
import type { GestureKind } from "./protocol";

export const LOCAL_AVATAR_POS: readonly [number, number, number] = [-0.7, 0, 0];
export const REMOTE_AVATAR_POS: readonly [number, number, number] = [0.7, 0, 0];
export const HOLD_HANDS_DISTANCE = 0.6;

function handRaised(hand: HandState | null): boolean {
  // Stabilized gesture, not a raw instantaneous check — same reasoning as the smile check below.
  return !!hand?.present && hand.gesture === "raised";
}

function handOpen(hand: HandState | null): boolean {
  return !!hand?.present && hand.curl < 0.3;
}

function frameSatisfiesSimpleGesture(frame: TrackingFrame | null, gesture: Exclude<GestureKind, "hold-hands">): boolean {
  if (!frame) return false;
  switch (gesture) {
    case "smile":
      // Uses the stabilized discrete expression (not the raw continuous value) so a fleeting
      // twitch of the mouth can't accidentally score a round — it has to hold long enough to
      // actually be classified as a smile/laugh.
      return frame.expression === "smile" || frame.expression === "laugh";
    case "raise-hand":
      return handRaised(frame.leftHand) || handRaised(frame.rightHand);
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
