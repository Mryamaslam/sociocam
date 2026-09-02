import { useState } from "react";

interface LobbyProps {
  onCreate: () => void;
  onJoin: (code: string) => void;
  error: string | null;
  busy: boolean;
  waitingRoomCode: string | null;
  initialJoinCode?: string;
}

export function Lobby({ onCreate, onJoin, error, busy, waitingRoomCode, initialJoinCode }: LobbyProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? "");
  const [copied, setCopied] = useState(false);

  if (waitingRoomCode) {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${waitingRoomCode}`;
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard unavailable — the visible link/code still work
      }
    };

    return (
      <div className="lobby">
        <h1>Camera Social World</h1>
        <p className="lobby__subtitle">Waiting for your friend to join...</p>
        <div className="lobby__card lobby__code">{waitingRoomCode}</div>
        <p className="lobby__hint">Share this code, or send them a direct link:</p>
        <div className="invite-link-row">
          <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
          <button onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h1>Camera Social World</h1>
      <p className="lobby__subtitle">Create a private room, or join one your friend already started.</p>

      <div className="lobby__card">
        <button disabled={busy} onClick={onCreate}>
          Create room
        </button>
      </div>

      <div className="lobby__divider">or</div>

      <div className="lobby__card">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Enter room code"
          maxLength={5}
        />
        <button disabled={busy || joinCode.length < 5} onClick={() => onJoin(joinCode)}>
          Join room
        </button>
      </div>

      {error && <p className="lobby__error">{error}</p>}
    </div>
  );
}
