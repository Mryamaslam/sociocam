import { MEMBER_POSITIONS, handWorldPosition, distance3, type HandPosition, type Vec3 } from "./spatialMath.js";

// Distance hysteresis: once close, it takes MORE separation to count as "no longer close" than
// it took to become close in the first place — avoids the raw proximity flag itself flickering
// right at the boundary.
const ENTER_DISTANCE = 0.6;
const EXIT_DISTANCE = 0.75;

// Time-based distinction between a brief high-five and a sustained hold — this is what makes
// them different interactions at all, not just the same "hands touched" event.
const HOLD_MIN_MS = 350;
const BRIEF_CONTACT_MIN_MS = 60;

interface MemberHands {
  leftHand: HandPosition | null;
  rightHand: HandPosition | null;
}

interface RoomInteractionState {
  hands: [MemberHands | null, MemberHands | null];
  proximate: boolean;
  proximateSince: number | null;
  holding: boolean;
}

export interface InteractionResult {
  holding: boolean;
  holdingChanged: boolean;
  highFivePulse: boolean;
}

const states = new Map<string, RoomInteractionState>();

function getState(roomCode: string): RoomInteractionState {
  let s = states.get(roomCode);
  if (!s) {
    s = { hands: [null, null], proximate: false, proximateSince: null, holding: false };
    states.set(roomCode, s);
  }
  return s;
}

export function clearRoomInteraction(roomCode: string): void {
  states.delete(roomCode);
}

function anyHandsWithin(a: MemberHands, posA: Vec3, b: MemberHands, posB: Vec3, threshold: number): boolean {
  const aHands = [a.leftHand, a.rightHand].filter((h): h is HandPosition => !!h);
  const bHands = [b.leftHand, b.rightHand].filter((h): h is HandPosition => !!h);
  for (const ah of aHands) {
    const ap = handWorldPosition(posA, ah);
    for (const bh of bHands) {
      const bp = handWorldPosition(posB, bh);
      if (distance3(ap, bp) < threshold) return true;
    }
  }
  return false;
}

/**
 * The only place "are these two people holding hands / did they just high-five" gets decided.
 * Each client reports only its OWN hand positions — never a claim about the other person — so
 * neither side can unilaterally declare an interaction with the other.
 */
export function updateMemberHands(roomCode: string, memberIndex: 0 | 1, payload: MemberHands): InteractionResult {
  const s = getState(roomCode);
  s.hands[memberIndex] = payload;
  return evaluate(s);
}

function evaluate(s: RoomInteractionState): InteractionResult {
  const now = Date.now();
  const [a, b] = s.hands;
  const wasHolding = s.holding;
  let highFivePulse = false;

  const close = a && b ? anyHandsWithin(a, MEMBER_POSITIONS[0], b, MEMBER_POSITIONS[1], s.proximate ? EXIT_DISTANCE : ENTER_DISTANCE) : false;

  if (close && !s.proximate) {
    s.proximate = true;
    s.proximateSince = now;
  } else if (!close && s.proximate) {
    const heldFor = s.proximateSince != null ? now - s.proximateSince : 0;
    s.proximate = false;
    s.proximateSince = null;
    if (!s.holding && heldFor >= BRIEF_CONTACT_MIN_MS && heldFor < HOLD_MIN_MS) {
      highFivePulse = true;
    }
    s.holding = false; // separated — whether it was a hold or nothing, it's over now
  }

  if (s.proximate && !s.holding && s.proximateSince != null && now - s.proximateSince >= HOLD_MIN_MS) {
    s.holding = true;
  }

  return { holding: s.holding, holdingChanged: s.holding !== wasHolding, highFivePulse };
}
