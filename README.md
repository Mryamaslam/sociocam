# Camera-Driven Multiplayer Social World — Phase A

This is the "Core Magic" milestone: two people log in, open a private room, and
their facial expressions, hands, and basic body movement drive simple 3D avatars
in real time — including reaching out to hold hands — then play one short
cooperative gesture-matching game together. The goal is the full loop from your
spec: login → create room → invite → both join → avatars appear → camera tracking
→ expressions/gestures mirror → interaction → cooperative game → result/reward.

Deliberately not built yet: friends lists, a real social graph, more than one
game, monetization, or scale-out infrastructure. That's Phases B–F.

## How it's built

- **`server/`** — Node + Express + Socket.IO.
  - `auth.ts` / `userStore.ts`: minimal accounts — username/password (bcrypt
    hashed), a signed JWT session, a display name, and a personalized avatar
    color, stored in a flat JSON file (`server/data/users.json`, gitignored).
    No native DB dependency on purpose, to avoid Windows build-tool friction for
    a Phase A validation build.
  - Socket.IO handles room codes and WebRTC offer/answer/ICE relay only. It
    never sees video, audio, or tracking data, and every socket connection is
    authenticated with the same JWT.
  - `POST /api/game-result` persists each player's best score/games played
    after a cooperative-game round — the "reward" the account carries forward.
- **`client/`** — Vite + React + TypeScript.
  1. Captures the local webcam and runs MediaPipe FaceLandmarker + HandLandmarker
     + **PoseLandmarker** fully in-browser — mouth/eye/eyebrow/head-pose,
     per-hand curl and position, and shoulder/torso lean.
  2. Streams that tracking data (not raw video) to the other browser over a
     peer-to-peer WebRTC **data channel**. The same channel also carries small
     game-round messages (prompt, timer, result).
  3. Renders both people as stylized 3D avatars (Three.js / `@react-three/fiber`)
     in the account's chosen color, with a body that leans, arms that reach
     toward wherever your hands are, and a face that mirrors your expression.
  4. Detects when both players' hands come close together in the shared 3D
     space ("holding hands") — used both as an ambient visual highlight and as
     the finale prompt in the cooperative game.
  5. Runs **"Mirror Moment"**, a 5-round cooperative game: the room creator
     (host) picks a gesture each round — smile, raise a hand, open palms, hold
     hands — and both players must do it within 6 seconds. Score ≥60% and you
     get a "Synced Duo" badge; either way the result is saved to both accounts.

Why avatar-only instead of a video call: lighter on bandwidth, more private (raw
camera footage never leaves the device), and it's the actual product bet — if
expressive avatars alone don't feel personal, that's the thing to fix before
adding anything else.

## Running it locally

Two terminals, from the repo root:

```bash
npm install
npm run dev:server
```

```bash
npm run dev:client
```

Open `http://localhost:5173`, register an account (pick a display name and
avatar color), create a room, then either share the room **code** or the
**copy-link** button (`?room=CODE` — opens straight to auto-join once the other
person is logged in) with a second browser/device. Allow camera access on both
sides.

**Camera and cross-device testing:** `getUserMedia` requires a secure context.
`localhost` is exempt, so two tabs on the same machine work out of the box. To
test from a second physical device you'll need HTTPS — `ngrok`/`localtunnel` or
a local TLS cert. Testing two accounts in two tabs of the *same* browser also
needs care: sessions are stored in `localStorage`, which is shared per-origin,
so the second tab will inherit the first tab's login until you explicitly log
out and register/log in as the second account there.

If the client and server run on different hosts, set `VITE_SIGNALING_URL` in
`client/.env.local`. In production, set a real `JWT_SECRET` env var on the
server — the default is a dev-only placeholder.

## What's verified vs. what still needs a real camera

Verified end-to-end in this build (two authenticated accounts, real signaling
server, real WebRTC data channel): register/login, room create/join, invite
links, peer profile exchange, avatar rendering in each account's color, the
full 5-round game loop (prompt → timer → result → next round → game-over), and
score persistence to both accounts.

**Not verifiable without a real browser + webcam** (this was built and reviewed
carefully, but a sandboxed environment without camera access can't exercise
it): whether face/hand/pose tracking actually feels accurate and responsive,
whether the hold-hands proximity threshold feels natural, and whether the
gesture-matching game is fun rather than fiddly. That's the real Phase A
validation pass — do it with real people next.

## What "done" looks like for Phase A

- Two people can go from opening the site to standing in a room together in
  under a minute, including creating accounts.
- Smiling, raising a hand, opening palms, and reaching out to hold hands are
  all recognizable on the other person's avatar within a few hundred ms.
- The connection survives a normal home Wi-Fi / 4G network without a TURN
  server (if not, add one — see Known gaps).
- Playing "Mirror Moment" once feels like a fun, low-stakes shared moment, not
  a chore — if it doesn't, that's more valuable to learn now than after Phase B.

## Known gaps / deliberately deferred

- **No TURN server.** Public STUN (`stun.l.google.com`) covers most home
  networks; symmetric NATs/some corporate networks will fail to connect
  peer-to-peer. Add TURN (coturn or a hosted service) before wider rollout.
- **Accounts are intentionally minimal.** No password reset, no email
  verification, no OAuth, JSON-file storage instead of a real database. Fine
  for a validation build with a handful of testers; needs revisiting before
  any real user data is at stake.
- **Avatars are procedural placeholders**, not rigged 3D character models —
  intentional, to test whether expression-driven interaction feels good before
  investing in an avatar art pipeline.
- **Hand tracking is approximate** (a single "curl" value and wrist position
  per hand, not a full hand skeleton); **body movement is approximate** (torso
  lean + shoulder-anchored arm segments, not a full pose rig). Good enough to
  read "raised hand," "open palm," "leaning," not for precision gesture games.
- **Hold-hands proximity mapping is a simplification** — hand position is
  derived straight from 2D camera landmarks onto a fixed plane in front of each
  avatar, not true 3D biomechanics. Players will need a moment to learn where
  their hand "is" in the shared space; that's an acceptable Phase A trade-off.
- **2-person mesh only.** WebRTC mesh doesn't scale past a handful of
  participants; group rooms (Phase C+) will need an SFU (e.g. LiveKit/mediasoup).
- **One game.** "Mirror Moment" exists to prove the cooperative-interaction
  loop end-to-end, not as the final game design.

## Roadmap (per the product strategy)

`Phase A: Core Magic (this)` → `Phase B: Social Layer` → `Phase C: Game
Expansion` → `Phase D: Progression` → `Phase E: Monetization` → `Phase F: Scale`

Don't start Phase B until Phase A has been validated with real test pairs.
