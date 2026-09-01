import { createServer } from "http";
import { unlinkSync, existsSync, writeFileSync } from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import type { ClientToServerEvents, PeerProfile, ServerToClientEvents } from "./types.js";
import { createRoom, joinRoom, leaveRoom, findRoomBySocket, otherMember } from "./rooms.js";
import { authRouter, verifyToken } from "./auth.js";
import { findById, publicProfile, updateProfile, setAvatarUrl } from "./userStore.js";
import { avatarUpload, checkGlb, avatarPathFor, AVATAR_DIR } from "./avatarUpload.js";
import { updateMemberHands, clearRoomInteraction } from "./interactions.js";
import { createSession, submitScore } from "./gameSessions.js";
import { authRateLimiter, apiRateLimiter, SocketRateLimiter } from "./rateLimit.js";
import { validate, roomJoinSchema, handUpdateSchema, webrtcOfferSchema, webrtcAnswerSchema, webrtcIceSchema, profileUpdateSchema, gameResultSchema } from "./validation.js";
import { audit } from "./auditLog.js";
import { env } from "./env.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "16kb" })); // every real body here (auth, profile, game-result) is tiny
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRateLimiter, authRouter);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  (req as any).userId = payload.sub;
  next();
}

app.use("/api", apiRateLimiter);

app.get("/api/me", requireAuth, (req, res) => {
  const user = findById((req as any).userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ profile: publicProfile(user) });
});

app.patch("/api/profile", requireAuth, (req, res) => {
  const parsed = validate(profileUpdateSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const user = updateProfile((req as any).userId, parsed.data);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ profile: publicProfile(user) });
});

// Realistic avatar upload — see avatarUpload.ts for validation. Anyone can fetch a room member's
// avatar file (their partner's browser needs to render it, unauthenticated), but only the owning
// account can replace or delete its own.
app.post("/api/avatar", requireAuth, (req, res) => {
  avatarUpload.single("avatar")(req, res, (err) => {
    const userId = (req as any).userId as string;
    if (err) {
      audit("invalid-message", { userId, event: "avatar-upload", reason: err.message });
      return res.status(400).json({ error: err.message });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded (field name must be 'avatar')" });
    const check = checkGlb(file.buffer);
    if (!check.ok) {
      audit("invalid-message", { userId, event: "avatar-upload", reason: check.error });
      return res.status(400).json({ error: check.error });
    }
    try {
      writeFileSync(avatarPathFor(userId), file.buffer);
    } catch (err) {
      audit("invalid-message", { userId, event: "avatar-upload", reason: "storage path rejected" });
      return res.status(400).json({ error: "Could not store avatar" });
    }
    const user = setAvatarUrl(userId, `/avatars/${userId}.glb`);
    if (!user) return res.status(404).json({ error: "User not found" });
    audit("avatar-uploaded", { userId, bytes: file.buffer.length });
    res.json({ profile: publicProfile(user) });
  });
});

// Deletion control, per the privacy requirement — a user can remove their uploaded avatar and
// its derived data at any time, not just overwrite it.
app.delete("/api/avatar", requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const path = avatarPathFor(userId);
  if (existsSync(path)) unlinkSync(path);
  const user = setAvatarUrl(userId, null);
  if (!user) return res.status(404).json({ error: "User not found" });
  audit("avatar-uploaded", { userId, deleted: true });
  res.json({ profile: publicProfile(user) });
});

app.use("/avatars", express.static(AVATAR_DIR, { maxAge: "1h" }));

// Scores are never taken from a single client's say-so — see gameSessions.ts. A submission is
// held until BOTH players in the session have reported, and only a matching pair is persisted.
app.post("/api/game-result", requireAuth, (req, res) => {
  const parsed = validate(gameResultSchema, req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const userId = (req as any).userId as string;
  const result = submitScore(parsed.data.sessionId, userId, parsed.data.score);

  if (result.status === "invalid") {
    audit("game-result-rejected", { userId, sessionId: parsed.data.sessionId, reason: "invalid session" });
    return res.status(400).json({ error: "Unknown or expired game session" });
  }
  if (result.status === "pending") {
    return res.status(202).json({ status: "pending" });
  }
  if (result.status === "mismatch") {
    return res.status(409).json({ error: "Result did not match the other player's — not recorded" });
  }
  res.json({ profile: result.profile });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: env.corsOrigin },
  maxHttpBufferSize: 16 * 1024, // every real message here is a few hundred bytes; anything near this is abuse
  connectionStateRecovery: { maxDisconnectionDuration: 60_000 }, // best-effort resume across brief network blips
});

// Cap concurrent connections per account — one compromised/misbehaving client script shouldn't
// be able to open unbounded sockets against the server.
const MAX_SOCKETS_PER_USER = 5;
const socketsByUser = new Map<string, Set<string>>();

const handUpdateLimiter = new SocketRateLimiter(30, 15); // ~10Hz expected, generous burst allowance
const signalingLimiter = new SocketRateLimiter(40, 20); // offer/answer/ICE — bursty during connect, then quiet
const roomActionLimiter = new SocketRateLimiter(10, 1); // create/join/leave — rare, human-triggered

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = typeof token === "string" ? verifyToken(token) : null;
  const user = payload ? findById(payload.sub) : null;
  if (!user) {
    audit("socket-auth-rejected", { ip: socket.handshake.address });
    next(new Error("unauthorized"));
    return;
  }

  const existing = socketsByUser.get(user.id) ?? new Set<string>();
  if (existing.size >= MAX_SOCKETS_PER_USER) {
    audit("connection-limit-rejected", { userId: user.id });
    next(new Error("too many connections"));
    return;
  }

  socket.data.profile = {
    userId: user.id,
    displayName: user.displayName,
    avatarConfig: user.avatarConfig,
    avatarUrl: user.avatarUrl,
  } satisfies PeerProfile;
  next();
});

io.on("connection", (socket) => {
  const profile: PeerProfile = socket.data.profile;
  const sockets = socketsByUser.get(profile.userId) ?? new Set<string>();
  sockets.add(socket.id);
  socketsByUser.set(profile.userId, sockets);

  socket.on("room:create", (ack) => {
    if (!roomActionLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "room:create" });
    const room = createRoom(socket.id, profile);
    socket.join(room.code);
    ack({ code: room.code });
  });

  socket.on("room:join", (code, ack) => {
    if (!roomActionLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "room:join" });
    const parsed = validate(roomJoinSchema, code);
    if (!parsed.ok) return ack({ ok: false, error: "Invalid room code" });

    const result = joinRoom(parsed.data, socket.id, profile);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    socket.join(result.room.code);
    const peer = otherMember(result.room, socket.id);
    ack({
      ok: true,
      peerId: peer?.socketId ?? null,
      peerProfile: peer ? { userId: peer.userId, displayName: peer.displayName, avatarConfig: peer.avatarConfig, avatarUrl: peer.avatarUrl } : null,
    });
    if (peer) {
      io.to(peer.socketId).emit("room:peer-joined", { peerId: socket.id, peerProfile: profile });
    }
  });

  socket.on("room:leave", () => {
    handleLeave(socket.id);
  });

  socket.on("webrtc:offer", (payload) => {
    if (!signalingLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "webrtc:offer" });
    const parsed = validate(webrtcOfferSchema, payload);
    if (!parsed.ok) return audit("invalid-message", { userId: profile.userId, event: "webrtc:offer", reason: parsed.error });
    io.to(parsed.data.to).emit("webrtc:offer", { from: socket.id, sdp: parsed.data.sdp as RTCSessionDescriptionInit });
  });

  socket.on("webrtc:answer", (payload) => {
    if (!signalingLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "webrtc:answer" });
    const parsed = validate(webrtcAnswerSchema, payload);
    if (!parsed.ok) return audit("invalid-message", { userId: profile.userId, event: "webrtc:answer", reason: parsed.error });
    io.to(parsed.data.to).emit("webrtc:answer", { from: socket.id, sdp: parsed.data.sdp as RTCSessionDescriptionInit });
  });

  socket.on("webrtc:ice-candidate", (payload) => {
    if (!signalingLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "webrtc:ice-candidate" });
    const parsed = validate(webrtcIceSchema, payload);
    if (!parsed.ok) return audit("invalid-message", { userId: profile.userId, event: "webrtc:ice-candidate", reason: parsed.error });
    io.to(parsed.data.to).emit("webrtc:ice-candidate", { from: socket.id, candidate: parsed.data.candidate as RTCIceCandidateInit });
  });

  // Each client reports only its OWN hand positions — the server decides hold/high-five state
  // from both sides' reports (see interactions.ts), and broadcasts that as the one truth.
  socket.on("hand:update", (payload) => {
    if (!handUpdateLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "hand:update" });
    const parsed = validate(handUpdateSchema, payload);
    if (!parsed.ok) return audit("invalid-message", { userId: profile.userId, event: "hand:update", reason: parsed.error });

    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const memberIndex = room.members.findIndex((m) => m.socketId === socket.id);
    if (memberIndex !== 0 && memberIndex !== 1) return;
    const result = updateMemberHands(room.code, memberIndex, parsed.data);
    if (result.holdingChanged) io.to(room.code).emit("interaction:state", { holding: result.holding });
    if (result.highFivePulse) io.to(room.code).emit("interaction:high-five");
  });

  socket.on("game:session-start", () => {
    if (!roomActionLimiter.consume(socket.id)) return audit("rate-limited", { userId: profile.userId, event: "game:session-start" });
    const room = findRoomBySocket(socket.id);
    if (!room || room.members.length !== 2) return;
    const sessionId = createSession([room.members[0].userId, room.members[1].userId]);
    io.to(room.code).emit("game:session-started", { sessionId });
  });

  socket.on("disconnect", () => {
    const sockets = socketsByUser.get(profile.userId);
    sockets?.delete(socket.id);
    if (sockets && sockets.size === 0) socketsByUser.delete(profile.userId);
    handleLeave(socket.id);
  });

  function handleLeave(socketId: string) {
    const before = findRoomBySocket(socketId);
    if (!before) return;
    const result = leaveRoom(socketId);
    if (result?.remainingPeer) {
      io.to(result.remainingPeer).emit("room:peer-left", { peerId: socketId });
    } else {
      clearRoomInteraction(before.code);
    }
  }
});

httpServer.listen(env.port, () => {
  console.log(`Signaling server listening on http://localhost:${env.port}`);
});
