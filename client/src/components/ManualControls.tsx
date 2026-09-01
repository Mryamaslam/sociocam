import { useEffect } from "react";
import type { ExpressionLabel, HandGestureLabel } from "../types/tracking";

const EXPRESSION_KEYS: Record<string, ExpressionLabel> = {
  "0": "neutral",
  "1": "smile",
  "2": "laugh",
  "3": "surprise",
  "4": "sad",
  "5": "angry",
  "6": "confused",
  "7": "blink",
  "8": "wink",
};

const GESTURE_KEYS: Record<string, HandGestureLabel> = {
  q: "idle",
  w: "wave",
  e: "raised",
  r: "point",
  t: "grab",
};

interface ManualControlsProps {
  expression: ExpressionLabel;
  gesture: HandGestureLabel;
  onExpression: (expression: ExpressionLabel) => void;
  onGesture: (gesture: HandGestureLabel) => void;
}

/** Camera/tracking unavailable fallback — buttons work for touch and mouse; number/letter keys mirror them for keyboard users. Per the product spec: tracking unavailable must never mean unusable. */
export function ManualControls({ expression, gesture, onExpression, onGesture }: ManualControlsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in EXPRESSION_KEYS) onExpression(EXPRESSION_KEYS[key]);
      else if (key in GESTURE_KEYS) onGesture(GESTURE_KEYS[key]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExpression, onGesture]);

  return (
    <div className="manual-controls">
      <p className="manual-controls__title">Camera unavailable — control your avatar manually</p>
      <div className="manual-controls__row">
        <span className="manual-controls__label">Expression</span>
        {(Object.keys(EXPRESSION_KEYS) as (keyof typeof EXPRESSION_KEYS)[]).map((key) => (
          <button
            key={key}
            className={expression === EXPRESSION_KEYS[key] ? "selected" : ""}
            onClick={() => onExpression(EXPRESSION_KEYS[key])}
          >
            {EXPRESSION_KEYS[key]}
          </button>
        ))}
      </div>
      <div className="manual-controls__row">
        <span className="manual-controls__label">Hand</span>
        {(Object.keys(GESTURE_KEYS) as (keyof typeof GESTURE_KEYS)[]).map((key) => (
          <button key={key} className={gesture === GESTURE_KEYS[key] ? "selected" : ""} onClick={() => onGesture(GESTURE_KEYS[key])}>
            {GESTURE_KEYS[key]}
          </button>
        ))}
      </div>
    </div>
  );
}
