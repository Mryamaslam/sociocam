import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import type { ClientToServerEvents, PeerProfile, ServerToClientEvents } from "./types.js";
import { createRoom, joinRoom, leaveRoom, findRoomBySocket, otherMember } from "./rooms.js";
import { authRouter, verifyToken } from "./auth.js";
import { findById, recordGameResult, publicProfile } from "./userStore.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  (req as any).userId = payload.sub;
  next();
}

app.get("/api/me", requireAuth, (req, res) => {
  const user = findById((req as any).userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ profile: publicProfile(user) });
});

app.post("/api/game-result", requireAuth, (req, res) => {
  const score = Number(req.body?.score);
  if (!Number.isFinite(score) || score < 0) return res.status(400).json({ error: "Invalid score" });
  const user = recordGameResult((req as any).userId, score);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ profile: publicProfile(user) });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = typeof token === "string" ? verifyToken(token) : null;
  const user = payload ? findById(payload.sub) : null;
  if (!user) {
    next(new Error("unauthorized"));
    return;
  }
  socket.data.profile = { userId: user.id, displayName: user.displayName, avatarColor: user.avatarColor } satisfies PeerProfile;
  next();
});

io.on("connection", (socket) => {
  const profile: PeerProfile = socket.data.profile;

  socket.on("room:create", (ack) => {
    const room = createRoom(socket.id, profile);
    socket.join(room.code);
    ack({ code: room.code });
  });

  socket.on("room:join", (code, ack) => {
    const result = joinRoom(code, socket.id, profile);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    socket.join(result.room.code);
    const peer = otherMember(result.room, socket.id);
    ack({ ok: true, peerId: peer?.socketId ?? null, peerProfile: peer ? { userId: peer.userId, displayName: peer.displayName, avatarColor: peer.avatarColor } : null });
    if (peer) {
      io.to(peer.socketId).emit("room:peer-joined", { peerId: socket.id, peerProfile: profile });
    }
  });

  socket.on("room:leave", () => {
    handleLeave(socket.id);
  });

  socket.on("webrtc:offer", ({ to, sdp }) => {
    io.to(to).emit("webrtc:offer", { from: socket.id, sdp });
  });

  socket.on("webrtc:answer", ({ to, sdp }) => {
    io.to(to).emit("webrtc:answer", { from: socket.id, sdp });
  });

  socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("webrtc:ice-candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    handleLeave(socket.id);
  });

  function handleLeave(socketId: string) {
    const before = findRoomBySocket(socketId);
    if (!before) return;
    const result = leaveRoom(socketId);
    if (result?.remainingPeer) {
      io.to(result.remainingPeer).emit("room:peer-left", { peerId: socketId });
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Signaling server listening on http://localhost:${PORT}`);
});
