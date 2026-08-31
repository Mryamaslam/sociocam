import { useEffect, useState } from "react";
import { useGameStore } from "../state/gameStore";
import { GESTURE_LABELS } from "../game/protocol";

interface GameOverlayProps {
  isHost: boolean;
  onStart: () => void;
  onPlayAgain: () => void;
}

export function GameOverlay({ isHost, onStart, onPlayAgain }: GameOverlayProps) {
  const phase = useGameStore((s) => s.phase);
  const roundIndex = useGameStore((s) => s.roundIndex);
  const totalRounds = useGameStore((s) => s.totalRounds);
  const gesture = useGameStore((s) => s.gesture);
  const deadlineTs = useGameStore((s) => s.deadlineTs);
  const lastRoundSuccess = useGameStore((s) => s.lastRoundSuccess);
  const score = useGameStore((s) => s.score);

  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (phase !== "round-active" || !deadlineTs) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [phase, deadlineTs]);

  if (phase === "idle") {
    return (
      <div className="game-overlay game-overlay--center">
        {isHost ? (
          <button className="game-overlay__cta" onClick={onStart}>
            Start cooperative game
          </button>
        ) : (
          <p className="game-overlay__hint">Waiting for your friend to start the game...</p>
        )}
      </div>
    );
  }

  if (phase === "game-over") {
    const success = score >= Math.ceil(totalRounds * 0.6);
    return (
      <div className="game-overlay game-overlay--center">
        <div className="game-result-card">
          <h2>{success ? "You two are in sync! 🎉" : "So close — try again!"}</h2>
          <p className="game-result-card__score">
            {score} / {totalRounds}
          </p>
          {success && <p className="game-result-card__badge">🏅 Synced Duo</p>}
          {isHost ? (
            <button className="game-overlay__cta" onClick={onPlayAgain}>
              Play again
            </button>
          ) : (
            <p className="game-overlay__hint">Waiting for your friend to restart...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="game-overlay game-overlay--top">
      <div className="game-prompt">
        <span className="game-prompt__round">
          Round {roundIndex + 1}/{totalRounds}
        </span>
        <span className="game-prompt__gesture">{gesture ? GESTURE_LABELS[gesture] : ""}</span>
        {phase === "round-active" && <span className="game-prompt__timer">{secondsLeft}s</span>}
        {phase === "round-result" && (
          <span className={`game-prompt__result game-prompt__result--${lastRoundSuccess ? "success" : "fail"}`}>
            {lastRoundSuccess ? "Nailed it!" : "Missed it"}
          </span>
        )}
      </div>
    </div>
  );
}
