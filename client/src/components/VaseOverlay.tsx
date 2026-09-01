import { useVaseStore } from "../state/vaseStore";

interface VaseOverlayProps {
  isHost: boolean;
  onStart: () => void;
  onPlayAgain: () => void;
}

export function VaseOverlay({ isHost, onStart, onPlayAgain }: VaseOverlayProps) {
  const phase = useVaseStore((s) => s.phase);
  const progress = useVaseStore((s) => s.progress);
  const integrity = useVaseStore((s) => s.integrity);

  if (phase === "idle") {
    return (
      <div className="game-overlay game-overlay--center">
        {isHost ? (
          <button className="game-overlay__cta" onClick={onStart}>
            Start The Vase
          </button>
        ) : (
          <p className="game-overlay__hint">Waiting for your friend to start The Vase...</p>
        )}
      </div>
    );
  }

  if (phase === "success" || phase === "broken") {
    return (
      <div className="game-overlay game-overlay--center">
        <div className="game-result-card">
          <h2>{phase === "success" ? "Delivered! 🎉" : "💥 The vase broke..."}</h2>
          <p>{phase === "success" ? "You two moved as one." : "Try matching each other's pace more closely."}</p>
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
      <div className="vase-hud">
        <div className="vase-hud__bar">
          <span className="vase-hud__label">To the table</span>
          <div className="vase-hud__track">
            <div className="vase-hud__fill vase-hud__fill--progress" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="vase-hud__bar">
          <span className="vase-hud__label">Vase integrity</span>
          <div className="vase-hud__track">
            <div className="vase-hud__fill vase-hud__fill--integrity" style={{ width: `${integrity * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
