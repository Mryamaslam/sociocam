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
    hashed), a signed JWT session, a display name, and a personalized
    **avatar config** (skin/hair style+color/eye color/clothing/accessory),
    stored in a flat JSON file (`server/data/users.json`, gitignored). No
    native DB dependency on purpose, to avoid Windows build-tool friction for a
    Phase A validation build. `avatarOptions.ts` validates every incoming
    config against a fixed set of options server-side — the client is never
    trusted to send an arbitrary value.
  - Rooms are **private only** — a room only exists once someone creates it, is
    identified by an unguessable 5-character code, and holds at most 2 people.
    There's no room listing/discovery endpoint at all, matching the "private
    room, invite only" MVP scope.
  - Socket.IO handles room codes and WebRTC offer/answer/ICE relay, and every
    socket connection is authenticated with the same JWT. It still never sees
    video, audio, face data, or full tracking frames — those stay peer-to-peer
    over WebRTC — but it now also receives each client's own hand *positions*
    (a few numbers, ~10x/sec) so it can independently referee hold-hands/
    high-five (see `interactions.ts` below). That's a deliberate, narrow
    exception: proximity between two people's hands isn't something either
    side's own client can be trusted to grade honestly.
  - `interactions.ts` / `spatialMath.ts`: the **hold-hands / high-five
    referee**. Each client reports only its own hand positions — never a claim
    about the other person — and the server independently computes whether the
    two players' hands are close, using the same world-space math each client
    uses to render its own avatars. It applies distance hysteresis (harder to
    "leave" close than to "become" close, so the raw signal can't flicker) and
    a time threshold (sustained ≥350ms = holding; a brief 60–350ms touch = a
    one-off high-five pulse instead) before broadcasting the *authoritative*
    result to both clients. Neither client can unilaterally declare "we're
    holding hands" — only the server's broadcast counts, including for
    scoring the cooperative game's hold-hands round.
  - `PATCH /api/profile` and `POST /api/game-result` let a logged-in account
    update its avatar/display name and persist best score/games played after a
    cooperative-game round.
- **`client/`** — Vite + React + TypeScript.
  1. Captures the local webcam and runs MediaPipe FaceLandmarker + HandLandmarker
     + **PoseLandmarker** fully in-browser — raw mouth/eye/eyebrow/head-pose
     blendshape scores, per-hand curl and position, and shoulder/torso lean.
  2. Feeds those raw blendshape scores through a **discrete expression
     classifier** (`lib/tracking/expressionClassifier.ts`): neutral, smile,
     laugh, surprise, sad, angry, confused, blink, wink. Raw per-frame scores
     are noisy, so a stabilizer applies exponential smoothing, hysteresis
     (a different, harder-to-clear threshold to leave a state than to enter
     one), debouncing (a candidate must lead consistently for ~180ms before it
     can take over), and a minimum hold duration per state — specifically so
     the avatar doesn't flicker between expressions on tracking noise. Only
     mouth/eyebrow shape goes through this discrete layer; eye openness and
     head orientation stay driven directly from raw per-frame values, since
     blink/wink laterality (*which* eye) and head pose should feel immediate,
     not something a named expression state can capture.
  3. Streams tracking data (not raw video) to the other browser over a
     peer-to-peer WebRTC **data channel**. The same channel also carries small
     game-round messages (prompt, timer, result).
  4. Renders both people as stylized, **fully customizable** 3D avatars
     (Three.js / `@react-three/fiber`) — skin tone, 4 hair styles × 7 colors,
     6 eye colors, 7 clothing colors, and glasses/hat/none, all pickable at
     registration with a live 3D preview (`AvatarCustomizer` +
     `AvatarPreview`), and editable later via `PATCH /api/profile`. A body
     that leans, arms that reach toward wherever your hands are, and a face
     that mirrors your stabilized expression.
  5. Runs a second, independent discrete-state classifier
     (`lib/tracking/handGestureClassifier.ts`, sharing the same smoothing/
     hysteresis/debounce machinery as expressions via `stateStabilizer.ts`)
     per hand: idle, wave, raised, point, grab. Wave needs its own ~1-second
     position-history buffer (2+ direction reversals with real amplitude —
     a single swipe or hand jitter won't trigger it); the rest are computed
     straight from the current frame's per-finger curl and wrist height.
  6. Sends its own hand *positions* (not the gesture label, not a claim about
     the other player) to the server at 10Hz, and renders whatever the server
     broadcasts back as the *authoritative* hold-hands/high-five state — see
     "the hold-hands / high-five referee" under `server/` above. The avatar's
     hand-glow highlight and the game's hold-hands round both key off that
     server state, not a local guess.
  7. Offers two cooperative games from an in-room picker (host chooses; the
     joiner's UI follows automatically once the first game message arrives):
     - **"Mirror Moment"** — 5 rounds, host picks a gesture each round (smile,
       raise a hand, open palms, hold hands), both players must do it within
       6 seconds. Score ≥60% for a "Synced Duo" badge.
     - **"The Vase"** (`game/vaseEngine.ts`, `scenes/VaseObject.tsx`) — the
       signature game. Two players carry a virtual pottery vase (a lathed 3D
       mesh, not a placeholder box) between their hands toward a table. Each
       client's hand motion produces a 0–1 "movement energy" signal — purely
       a gameplay number, explicitly **not** breath, heart rate, or any
       biometric reading, just how fast the tracked hand is currently moving.
       Every 100ms the host compares both players' energy: close values keep
       the vase's integrity high and let progress advance toward the table;
       a big gap drains integrity and makes it shake/tilt harder (visual
       feedback scales with both the instant mismatch and accumulated
       damage) and a synthesized Web Audio hum rises in pitch/volume with the
       tension. Sustained mismatch breaks the vase — it shatters into
       physically-animated shards and the game ends in failure; sustained
       sync delivers it to the table for a success chime and both accounts'
       results are saved, same as Mirror Moment. Both games share the same
       host-authoritative trust model (the host's client computes, both
       clients render what it broadcasts) — appropriate here since, unlike
       hold-hands, nothing about this signal is a claim about the *other*
       player that needs independent refereeing.
  8. Falls back to on-screen (touch/mouse) buttons with keyboard shortcuts for
     expressions and hand gestures whenever camera/tracking isn't available —
     denied permission, unsupported device, model failed to load — so the
     product stays usable rather than just showing a dead avatar. It flows
     through the exact same avatar-rendering and networking path as real
     tracking data (`lib/tracking/manualControl.ts` builds an ordinary
     `TrackingFrame` from the manual selection), so nothing downstream needs a
     special case for it.

Why avatar-only, stylized/procedural rendering instead of a video call or a
photorealistic face scan: lighter on bandwidth, more private (raw camera
footage and any image/scan of your real face never leave the device — only
small numeric blendshape scores derived from it, transiently, drive the
avatar), animates predictably, looks the same on every device, and it's the
actual product bet — if expressive avatars alone don't feel personal, that's
the thing to fix before adding anything else.

## Security & realtime architecture

Every claim below is backed by code in `server/`, not just intent:

- **Authentication**: bcrypt-hashed passwords, JWTs with a unique `jti` per
  token. `env.ts` refuses to start in production without a real `JWT_SECRET`
  (32+ chars) — no silent fallback to a guessable default outside dev.
- **Sessions**: 7-day tokens, but logout is real — `POST /auth/logout`
  revokes the token's `jti` server-side (`tokenRevocation.ts`), so a stolen
  or shared token can actually be cut off, not just forgotten client-side.
  (Full short-lived-access + refresh-token rotation was scoped out for this
  pass — see Known gaps.)
- **Authorization**: every action checks the caller actually owns/belongs to
  what it's acting on — profile edits are scoped to the caller's own account,
  room actions require actually being a member of that room (never a
  client-supplied room/user id taken at face value).
- **Schema validation** (`validation.ts`, Zod): every HTTP body and every
  socket event payload is parsed against a strict schema before touching any
  application logic — wrong types, out-of-range numbers, malformed room
  codes, oversized strings are all rejected before they can do anything.
- **Rate limiting**: HTTP auth endpoints (20 req/15min/IP via
  `express-rate-limit`), general `/api` routes (60/min/IP), and every
  high-frequency socket event has its own per-socket token bucket
  (`rateLimit.ts`) — a flood on `hand:update` can't starve room actions and
  vice versa.
- **Connection limits**: max 5 concurrent sockets per account.
- **Message size limits**: Socket.IO capped to 16KB per message
  (`maxHttpBufferSize`); HTTP JSON bodies capped to 16KB — generous for
  anything this app legitimately sends, tight against abuse.
- **Never trust client points**: `POST /api/game-result` does not accept a
  bare score. Starting a cooperative round asks the server for a session id
  (`game:session-start` → `gameSessions.ts`); both players must independently
  submit their own observed score against that id, and only a **matching
  pair** gets persisted — a single compromised or lying client can produce a
  mismatch (rejected, logged) but can't unilaterally grant itself or its
  opponent an unearned score. Verified with a real forged-session-id request
  (rejected) and a real two-account matched-score run (accepted and
  persisted) — see "What's verified" below.
- **Never trust client room permissions / hold-hands claims**: covered
  earlier — see "the hold-hands / high-five referee".
- **Secure headers**: `helmet` on every response (CSP, HSTS,
  X-Frame-Options, X-Content-Type-Options, etc.) — verified present via
  `curl -I`.
- **Audit logging**: security-relevant events (register, login success/
  failure, logout, rate-limit hits, rejected/invalid messages, game-result
  accepted/mismatched/rejected) are appended to `server/data/audit.log` as
  structured JSON lines, not just left to scroll past in stdout.
- **Dependency scanning**: `npm audit --workspaces` — clean as of this build;
  re-run it periodically, it's not a one-time check.
- **TLS/WSS**: not something app code can provide by itself — this server
  expects TLS termination at the hosting layer (a reverse proxy, load
  balancer, or platform like Fly/Render/Railway), which is normal practice
  and where a real certificate belongs. Not yet configured since there's no
  deployment target for this Phase A build; `CORS_ORIGIN` is already
  environment-configurable for when there is one.
- **Realtime architecture**: WebSocket (Socket.IO) throughout; server-
  authoritative state for anything that matters (hold-hands, high-five, game
  scores); client-side interpolation/smoothing for everything visual (avatar
  lerping, the expression/gesture stabilizers); Socket.IO's built-in
  heartbeat (ping/pong) and `connectionStateRecovery` enabled for best-effort
  resume across brief network blips — full seamless mid-game reconnection
  (rejoining an in-progress room after a real disconnect) is not built; a
  dropped connection currently means leaving and rejoining. Raw camera frames
  are never sent to the server — see "Camera privacy" throughout this doc.

## Realistic avatars

The original Phase A avatar was intentionally stylized/procedural (see
"Design system" below for why that was the right first call). The product
requirement changed to **the avatar must be a realistic, recognizable
rendering of the actual user** — "this is me inside the virtual room," not a
generic character. Two genuinely separate systems, per the spec's own split:

**1. Avatar generation — deliberately NOT built as a live API integration.**
Ready Player Me, the obvious first choice, **shut down entirely on January
31, 2026**. Its closest replacement, Avatar SDK's MetaPerson Creator, only
lets an *embedded* integration export the generated GLB on a paid "Pro"
plan (enterprise pricing, reportedly ~$800/mo) — not viable for a Phase A
build with no revenue yet. Rather than build around a paid live API, this
app takes **"bring your own GLB"**: the user creates a realistic rigged
avatar with any free external tool — a link to
[Avaturn](https://avaturn.me) (free, photo-based) and
[Avatar SDK's free consumer avatar creator](https://avatarsdk.com/avatar-creator/)
are both in the in-app upload panel — and uploads the exported `.glb` file
directly. This is arguably a *better* MVP architecture than a tight vendor
integration, not just a workaround: the retargeting system (below) isn't
locked to one provider's output, so a better/cheaper/free avatar-generation
service showing up later is a drop-in replacement, no app changes needed.
Server-side: `POST /api/avatar` (authenticated, real GLB magic-byte
validation — not just trusting the filename/mimetype, size-capped at 30MB)
stores the file and updates the account; `DELETE /api/avatar` removes it —
the explicit deletion control the privacy requirement calls for.

**2. Real-time retargeting — generic, not tied to one avatar's rig.**
`avatar/RealisticAvatarRig.tsx` loads the uploaded GLB and drives it from
the *exact same* compact tracking data already flowing through this app
(no new wire format, consistent with "compact state over the wire"):
- Mouth/eyebrow shape from the same `EXPRESSION_PRESETS` already used by the
  procedural avatar, mapped onto ARKit-named morph targets (`jawOpen`,
  `mouthSmileLeft`, `browInnerUp`, …) — these names come directly from
  MediaPipe's own ARKit-style blendshape categories, which is also what
  every mainstream avatar tool (Avaturn, Avatar SDK, the discontinued RPM)
  exports, so the mapping is a name match, not a guess.
- Eyes stay off the preset and read raw per-eye openness directly, same
  reasoning as the procedural avatar (blink/wink laterality only exists in
  the raw signal).
- Head orientation applied directly to a `Head` bone.
- Arms aimed toward the tracked hand position using each bone's own
  rest-pose child direction (read from the model's actual rig — `child.
  position` is already expressed in the parent bone's local space in
  three.js — not an assumed "arms point down" convention that breaks across
  T-pose/A-pose/differently-modeled rigs).
- Per-finger curl applied to finger bones directly from the same per-finger
  curl values the procedural avatar's hand already uses.
- Bone/morph-target lookup tries both plain names (`Head`) and the
  `mixamorig:`-prefixed convention, covering the two naming schemes actually
  in use across avatar tools.
- A GLB that fails to load, or doesn't have the bones/morph targets this
  expects, falls back to the procedural avatar automatically
  (`PlayerAvatar.tsx`, a real React error boundary) rather than breaking the
  room for either player.

**Verified against a real, non-trivial file**, not assumed correct: a
12MB sample avatar (Avatar SDK output, sourced from the
[met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) project's
public test assets, which independently confirmed the exact ARKit blendshape
names and Mixamo-style bone convention this was built against) was uploaded
through the actual UI, rendered correctly full-body in both the upload
panel's live preview and — critically — **in a real two-account room, as
the *remote* player's avatar**, proving the peer-to-peer profile exchange
correctly carries `avatarUrl` end to end. A live gesture change (raising a
hand) sent from the other browser visibly changed the avatar's arm position
in real time, confirming the retargeting runs live, not just at load. Two
real bugs were caught and fixed in the process, not assumed away: (1) plain
`Object3D.clone(true)` silently breaks `SkinnedMesh`/skeleton bindings in
three.js — fixed with `SkeletonUtils.clone` from `three-stdlib`, three.js's
own documented fix for this exact problem; (2) the realistic GLB is
full-scale (real-world proportions) while the existing scene was scaled
for the small procedural avatar — fixed with an auto-fit step that measures
the model's actual bounding box and scales/repositions it to match, which
also makes the system robust to *any* uploaded model's native unit
convention, not just the one sample file this was tested against.

## Production-readiness audit (this phase)

Following the realistic-avatar vertical slice, this pass tested the actual
product experience rather than just individual features in isolation —
onboarding, cross-GLB compatibility, multiplayer resilience, mobile layout,
security, and performance — and fixed what it found broken, without
replacing the architecture. Full results in `PRODUCTION_READINESS_REPORT.md`
(if present) or the session's own report; summary here:

- **Avatar onboarding** (`components/AvatarUpload.tsx`, `lib/glbValidation.ts`):
  drag-and-drop + file picker, local preview before saving, real upload
  progress (`XMLHttpRequest`, not a fake spinner), replace/delete, and
  client-side validation that mirrors the server's GLB structural checks
  (magic bytes, declared-length vs. actual size, JSON chunk integrity) —
  not just a `.glb` extension check.
- **Retargeting improvements** (`avatar/RealisticAvatarRig.tsx`): per-morph-
  target smoothing (`MorphSmoother`) to remove popping/jitter, wider morph
  coverage (mouthClose, outer eyebrows, eye squint on smile), and forearm
  bones now bend at half-strength toward the same hand target as an elbow
  approximation. Still fully generic — no GLB-specific branching.
- **Cross-GLB testing**: 5 structurally distinct real avatars (different
  node/mesh/skin counts, one with 247 nodes and VRM-style physics bones) all
  render correctly; 2 deliberately broken files (random bytes, a truncated
  valid GLB) are both rejected client-side with a clear message before any
  upload attempt, and independently rejected server-side as defense in
  depth. One bug found and fixed: a malformed-but-magic-byte-valid GLB used
  to crash the 3D preview to a silent blank box (three.js's loader throws
  outside React's render phase, so the error boundary around it couldn't
  reliably catch it) — fixed by extending client-side validation to check
  the full container structure before the preview ever attempts to render.
- **Multiplayer reconnect bug found and fixed**: the host's "a friend joined"
  listener was a one-shot `socket.once(...)` — correct for the first join,
  but it meant a friend who disconnected and rejoined the same room code
  never triggered a new offer; the host was stuck showing a dead `failed`
  connection with no recovery. Fixed with a re-armed listener plus a
  `room:peer-left` handler that resets to "waiting for your friend" and
  cleans up the old peer connection. Verified: upload → join → mutual
  avatar visibility → live gesture sync → simulated disconnect → automatic
  recovery on rejoin (both the passive-disconnect and explicit "Leave"
  paths) → the no-avatar-uploaded fallback still renders correctly
  alongside a realistic avatar in the same room.
- **Mobile layout bug found and fixed**: the 3D scene's camera used a fixed
  vertical FOV and distance, which is fine on a wide desktop viewport but
  severely crops both avatars on a narrow portrait phone screen (FOV is
  vertical, so the same value shows much less horizontal world space at a
  narrow aspect ratio). Fixed with a `ResponsiveCameraRig` that dollies the
  camera back only when the viewport is narrow enough to need it — desktop
  framing is untouched. Verified visually at a 375×812 viewport.
- **UX additions**: floating name labels over each avatar (not just the top
  bar), and a speaking indicator driven by live `face.mouthOpen` — wired
  correctly per code review, but not verified against a real live camera in
  this environment (see limitations below).
- **Security review of the avatar upload endpoint**: real GLB container
  validation (not just magic bytes) both client- and server-side, a 30MB
  size cap enforced end-to-end against a real 35MB file, filename/path
  sanitization plus a path-containment check in `avatarPathFor`, and —
  confirmed by reading the route handlers directly — neither `POST
  /api/avatar` nor `DELETE /api/avatar` accept any client-supplied user
  identifier; the target is always `req.userId` from the verified JWT, so
  there is no request shape that could act on another account's avatar.
- **Real (not estimated) numbers**: tracking-frame payload is ~260 bytes
  idle / ~680 bytes with both hands active, at 20–30fps ≈ 40–160kbps
  one-way per peer over the WebRTC data channel (never touches the
  server); a live 2-person room with two realistic avatars loaded used
  ~26MB of JS heap. **Not measured**: live FPS and CPU/GPU usage — the
  automated browser pane fully suspends `requestAnimationFrame` while
  hidden from view (standard Chromium page-visibility behavior, not
  something a script can work around), and CPU/GPU usage isn't exposable
  to browser JS at all under any circumstance. **Architecturally not
  testable**: 5- or 10-person rooms — `MAX_ROOM_SIZE = 2` and the WebRTC
  mesh design mean this app has no concept of a room bigger than 2 today;
  scaling that is a real design change (SFU), not a config value to raise.

## Camera privacy

Shown to the user **before** any camera permission prompt (`PrivacyNotice`,
also the source of truth this section is kept in sync with):

- **Why it's needed**: your camera drives your avatar's expressions/gestures.
- **What's processed**: face/hand tracking runs entirely on-device
  (MediaPipe, in-browser) — no server, ours or anyone else's, ever receives
  the camera feed for this.
- **What's transmitted**: only small derived numbers (blendshape scores, hand
  coordinates) sent peer-to-peer to the other player, plus — for hold-hands/
  high-five specifically — your hand position sent to the server so it can
  referee that one interaction (see above for why that's server-side at all).
  Never raw video.
- **What's stored**: nothing from your camera, ever — that hasn't changed.
  The one avatar-related exception: if you *choose* to upload a realistic
  avatar `.glb` file (see "Realistic avatars" above), that file is stored so
  your room partner's browser can fetch and render it, and you can delete it
  at any time. Your camera/photo never touches our servers to produce that
  file in the first place — that happens on whichever external tool you
  used, entirely outside this app. Accounts otherwise store only what you
  typed/chose (username, display name, avatar appearance) and game scores.
- **Controls**: declining the notice skips straight to the keyboard/touch
  fallback, no permission prompt attempted at all. Once enabled, a "Turn
  camera off" toggle is visible throughout the room — it actually stops the
  camera track (the browser's camera-in-use indicator goes off), not just
  hides the preview. No microphone is ever requested — this app has no audio
  input feature.

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
customize your avatar's skin/hair/eyes/clothing/accessory, with a live preview),
create a room, then either share the room **code** or the
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
server, real WebRTC data channel, real browser rendering — not just code
review): register/login, full avatar customization persisted server-side and
correctly rendered on both the customizer's live preview and in-room (skin,
hair style/color, eye color, clothing, glasses, hat — each visually distinct
per account), room create/join, invite links, peer profile exchange, the full
5-round game loop (prompt → timer → result → next round → game-over), score
persistence to both accounts, and the keyboard/touch fallback controls (which
also confirmed the whole expression/gesture → avatar pipeline renders
correctly, camera or not). The **server-side hold-hands/high-five referee was
verified with a scripted two-client protocol test**, not just a UI click-through
— it directly confirmed: sustained hand proximity becomes an authoritative
`holding: true` broadcast to both clients after ~350ms; separating immediately
broadcasts `holding: false`; and a brief sub-threshold touch fires a one-off
`high-five` pulse instead of a hold. That's the exact behavior the spec asks
for, proven against the real timing logic rather than eyeballed.

**The Vase was verified end-to-end for both outcomes**, using two accounts
with the manual-control fallback set to matched vs. mismatched movement:
matched activity carried the vase to the table (`Delivered! 🎉`) in one run,
correctly persisted `bestScore`, and a fresh mismatched run broke it
(`💥 The vase broke...`) without changing `bestScore` downward (it's a max,
not an overwrite) — confirming the instability/integrity/progress math, the
success and failure branches, and the score-submission path all work. Caught
and fixed a real bug in the process: the shatter animation's elapsed time was
originally computed once per React render (from `Date.now()`) instead of
advancing every frame, which would have frozen the shards mid-explosion
instead of animating them — fixed by having each shard track its own elapsed
time via `useFrame`'s per-frame delta.

Two real bugs were caught and fixed during this testing, not just written and
assumed correct: a stale-closure bug in the avatar customizer where two rapid
option picks could silently clobber each other (fixed with a functional state
update), and hat/glasses geometry that was mostly swallowed by the head
sphere's own surface (fixed by pushing both further from center — a sphere's
surface recedes fast near its silhouette, so "clear of the surface at dead
center" isn't clear of it a few cm to the side).

**The session-based anti-cheat scoring (added in the security-hardening pass)
was verified two ways**: a raw HTTP request with a forged/random session id
was correctly rejected (`400 Unknown or expired game session`), and a real
two-account Mirror Moment round through the actual UI produced exactly one
`game-result-accepted` audit-log entry with the matching score, independently
confirmed by logging back in as that account and reading `bestScore` straight
from `/api/me` — not just trusting what the UI displayed. Also directly
verified: `helmet`'s security headers present on every response (checked with
`curl -I`), and the privacy-notice gate — declining it skips camera
entirely and lands straight on the manual-control fallback with zero
permission prompt, confirmed by console/network inspection, not just the
visible UI state.

**Not verifiable without a real browser + webcam** (this was built and reviewed
carefully, but a sandboxed environment without camera access can't exercise
it): whether face/hand/pose tracking actually feels accurate and responsive,
whether the discrete expression states (smile/laugh/surprise/sad/angry/confused/
blink/wink) feel right rather than misclassified, whether the debounce/hold
timings feel responsive vs. sluggish, whether the hold-hands proximity
threshold feels natural, and whether the gesture-matching game is fun rather
than fiddly. That's the real Phase A validation pass — do it with real people
next.

## What "done" looks like for Phase A

- Two people can go from opening the site to standing in a room together in
  under a minute, including creating accounts.
- Smiling, raising a hand, opening palms, and reaching out to hold hands are
  all recognizable on the other person's avatar within a few hundred ms.
- The connection survives a normal home Wi-Fi / 4G network without a TURN
  server (if not, add one — see Known gaps).
- Playing "Mirror Moment" or "The Vase" once feels like a fun, low-stakes
  shared moment, not a chore — if it doesn't, that's more valuable to learn
  now than after Phase B.

## Known gaps / deliberately deferred

- **Realistic avatar arm/hand retargeting is an approximation, not full IK.**
  Arms aim as a single bone toward the tracked hand position — there's no
  real elbow bend, since hand tracking alone doesn't give an elbow position
  to target. Finger curl rotates around an assumed local axis that isn't
  guaranteed correct for every rig's bone convention. Both read as "the arm
  visibly reaches the right direction," not anatomically precise — a real
  upgrade path is a proper 2-bone/CCD IK solver once this is validated as
  worth the extra complexity.
- **The realistic avatar doesn't get the same hold-hands visual glow the
  procedural one does yet** (`highlightHands` is accepted but not yet wired
  to a material change on the GLB) — the underlying hold-hands *logic* is
  identical and server-authoritative either way, this is purely a missing
  visual cue on one avatar type.
- **No automated moderation on uploaded avatar files** beyond real GLB
  format validation (magic bytes) and a size cap — nothing to detect
  inappropriate/abusive content in an uploaded model. Fine for a Phase A
  build validated with known testers; would need real moderation before
  opening uploads to the public.
- **No refresh-token rotation, single-instance revocation only.** Tokens are
  7-day JWTs with a revocable `jti`; logout genuinely revokes. What's *not*
  built: short-lived access tokens with a separate long-lived refresh token
  (silent renewal without re-login), and the revocation list is in-memory
  (a multi-instance deployment would need it in shared storage, e.g. Redis).
  This was a deliberate scope call for a Phase A validation build — full
  rotation is meaningfully more surface area (a second token type, rotation-
  on-use, reuse-detection) for a security property (silent renewal) that
  doesn't matter yet with no real users. Do this before scaling past a
  validation build.
- **Rate limits and connection caps are single-process/in-memory.** Fine for
  one server instance; horizontal scaling would need them backed by shared
  storage (e.g. Redis) instead, same caveat as the revocation list above.
- **Game-session anti-cheat stops one client from unilaterally granting
  itself points, not a fully-compromised pair colluding together.** Both
  players' clients must submit a matching score, which stops a single lying
  client — it can't stop both players' clients from being modified to agree
  on an inflated number together. Meaningful further hardening (server
  computing the score itself from validated inputs, not trusting either
  client's tally) is real future work, not done here.

- **The Vase's difficulty constants are tuned by feel, not by testing against
  real people's movement.** The stable/unstable energy-difference thresholds,
  decay/recovery rates, and effort floor (all in `game/vaseEngine.ts`) came
  from the spec's own example numbers plus reasoning about pacing, not from
  watching real pairs play it. Very likely needs retuning after a few real
  playtests — e.g. if it's too easy to win by both standing still, or breaks
  too readily from ordinary hand tremor.

- **Expression and hand-gesture classification are rule-based, not ML.** Each
  expression/gesture is a hand-written scoring formula over MediaPipe's
  ARKit-style blendshapes and hand landmarks (e.g. smile ≈ mouth-corner-pull
  minus jaw-open, so a wide grin doesn't get misread as surprise). Smile/
  laugh/blink/grab/point are the most reliable since they map to a couple of
  strong, distinct signals; sad/angry/confused (subtler, overlapping brow
  signals) and wave (needs sustained back-and-forth motion, not just any hand
  movement) are more likely to need retuning once tested against real people.
- **The keyboard/touch fallback is a manual override, not simulated tracking.**
  Clicking "smile" holds that expression until you click something else — it
  doesn't decay back to neutral on its own the way a real face relaxing would.
  Good enough to keep the product usable without a camera; not a substitute
  for testing the real tracking experience.
- **No TURN server.** Public STUN (`stun.l.google.com`) covers most home
  networks; symmetric NATs/some corporate networks will fail to connect
  peer-to-peer. Add TURN (coturn or a hosted service) before wider rollout.
- **Accounts are intentionally minimal.** No password reset, no email
  verification, no OAuth, JSON-file storage instead of a real database. Fine
  for a validation build with a handful of testers; needs revisiting before
  any real user data is at stake.
- **Avatars are procedural/geometric, not rigged 3D character models or
  imported art assets** — intentional, to test whether expression-driven
  interaction feels good before
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

## Future scaling architecture (deliberately not built yet)

The product spec calls for Python/FastAPI, PostgreSQL, and Redis as the
target production stack. That's a real, considered decision — explicitly
discussed and confirmed — to defer, not an oversight:

- Everything in `server/` (auth, rate limiting, schema validation, the
  hold-hands referee, the game anti-cheat session mechanism, audit logging)
  is built in Node/Express/Socket.IO and is fully working and verified. A
  rewrite to FastAPI would mean re-implementing and re-testing all of it from
  scratch for a Phase A validation build with no real users yet — cost
  without a matching benefit right now. Node/Socket.IO is also, on its own
  merits, a strong fit for this specific problem (WebRTC signaling, realtime
  event fan-out) — the language choice isn't a compromise being tolerated,
  it's a reasonable one already.
- The flat-JSON-file user store (`server/data/users.json`) is the one piece
  worth revisiting first when this moves past a handful of testers —
  PostgreSQL is the natural next step for durability, concurrent-write
  safety, and querying, well before FastAPI/Redis become necessary. The
  spec's suggested entity list (`users`, `profiles`, `avatars`, `sessions`,
  `rooms`, `room_members`, `invitations`, `games`, `matches`, `game_players`,
  `points`, `xp`, `achievements`, `audit_logs`) is a reasonable target schema
  for that migration — most of it maps directly onto what already exists as
  in-memory/JSON-file shapes today (`UserRecord`, `Room`/`RoomMember`, the
  audit log lines).
- Redis becomes valuable once there's more than one server process —
  presence, rate-limit counters, and the token revocation list are all
  currently in-memory/single-instance (called out in Known gaps above); Redis
  is the standard fix for making those work across multiple instances, not
  something a single-instance Phase A build needs yet.
- The spec's suggested backend module list (`auth/ users/ rooms/ realtime/
  avatars/ tracking/ interactions/ games/ points/ subscriptions/ moderation/
  admin/`) maps onto what's already built as flat files rather than folders:
  `auth.ts`+`tokenRevocation.ts` ≈ auth/, `userStore.ts` ≈ users/+points/,
  `rooms.ts` ≈ rooms/, `index.ts` socket handlers ≈ realtime/,
  `avatarOptions.ts` ≈ avatars/, `interactions.ts`+`spatialMath.ts` ≈
  interactions/, `gameSessions.ts` ≈ games/+points/. `subscriptions/`,
  `moderation/`, and `admin/` don't exist yet because Phase A has no
  monetization, no content moderation surface, and no admin tooling — all
  genuinely Phase E/F concerns, not missing Phase A work.
- Similarly, the spec's suggested frontend folders (`app/ components/ pages/
  3d/ avatar/ tracking/ realtime/ room/ games/ state/ api/ ui/`) are already
  present conceptually under `client/src/` (`components/`, `avatar/`,
  `lib/tracking/`, `lib/webrtc/`, `scenes/` for 3D, `game/`, `state/`,
  `lib/api.ts`) — a folder-renaming pass to match the exact suggested names
  would be pure churn (risk of breaking working, tested code) for zero
  functional benefit, so it wasn't done.

## Design system

Applied ProgrammX's actual brand system rather than inventing a new one:
Bricolage Grotesque for headings, Hanken Grotesk for body text, JetBrains
Mono for the room-code/monospace bits, loaded via Google Fonts; the teal
accent (`#0E9E92` light-mode, `#2FD7C4` on the dark background this app
actually uses) as the single consistent call-to-action color across every
button, focus state, and highlight, replacing what had been slightly
different ad-hoc greens/teals per component. Consistent spacing/radius/
shadow tokens (CSS custom properties in `styles/global.css`) replace the
one-off pixel values each component previously invented for itself. This is
a real, if modest, "proper design system" per the spec's ask — not yet a
full component library with documented variants, which would be more than
a Phase A validation build's UI complexity actually needs.

## Roadmap (per the product strategy)

`Phase A: Core Magic (this)` → `Phase B: Social Layer` → `Phase C: Game
Expansion` → `Phase D: Progression` → `Phase E: Monetization` → `Phase F: Scale`

Don't start Phase B until Phase A has been validated with real test pairs.
