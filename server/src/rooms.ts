import { MAX_ROOM_SIZE, type PeerProfile, type Room, type RoomMember } from "./types.js";

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostSocketId: string, profile: PeerProfile): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    members: [{ socketId: hostSocketId, joinedAt: Date.now(), ...profile }],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(
  code: string,
  socketId: string,
  profile: PeerProfile
): { ok: true; room: Room } | { ok: false; error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "Room not found" };
  if (room.members.some((m) => m.socketId === socketId)) return { ok: true, room };
  if (room.members.length >= MAX_ROOM_SIZE) return { ok: false, error: "Room is full" };
  room.members.push({ socketId, joinedAt: Date.now(), ...profile });
  return { ok: true, room };
}

export function leaveRoom(socketId: string): { room: Room; remainingPeer: string | null } | null {
  for (const room of rooms.values()) {
    const idx = room.members.findIndex((m) => m.socketId === socketId);
    if (idx === -1) continue;
    room.members.splice(idx, 1);
    const remainingPeer = room.members[0]?.socketId ?? null;
    if (room.members.length === 0) rooms.delete(room.code);
    return { room, remainingPeer };
  }
  return null;
}

export function findRoomBySocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.members.some((m) => m.socketId === socketId)) return room;
  }
  return null;
}

export function otherMember(room: Room, socketId: string): RoomMember | null {
  return room.members.find((m) => m.socketId !== socketId) ?? null;
}
