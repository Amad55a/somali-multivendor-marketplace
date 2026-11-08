import "server-only";

import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { requireUser, type AuthenticatedUser } from "@/features/auth/sessions";
import { enforceRateLimit } from "@/features/auth/security";
import {
  getConversationPresence,
  markConversationMessagesRead,
  requireConversationParticipant,
  sendConversationMessage,
  updateConversationSocketPresence,
} from "@/features/communications/service";
import type {
  ClientToServerEvents,
  CommunicationSocketData,
  ServerToClientEvents,
  SocketAck,
  SocketAckCallback,
} from "@/features/communications/socket-events";
import { AppError } from "@/lib/errors/app-error";
import { locationCoordinatesSchema } from "@/features/communications/location";

type CommunicationIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  CommunicationSocketData
>;
type CommunicationSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  CommunicationSocketData
>;

const conversationIdSchema = z.uuid();
const messageSchema = z.object({
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
  content: z.string().trim().min(1).max(4000).optional(),
  productId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  location: locationCoordinatesSchema.optional(),
}).strict();

declare global {
  var communicationSocketIo: CommunicationIo | undefined;
}

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

function userRoom(userId: string) {
  return `user:${userId}`;
}

function presenceKey(conversationId: string, userId: string) {
  return `${conversationId}:${userId}`;
}

function allowedOrigin() {
  return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;
}

function socketRequest(socket: CommunicationSocket) {
  const headers = new Headers();
  const cookie = socket.handshake.headers.cookie;
  const address = socket.handshake.address;
  if (cookie) headers.set("cookie", cookie);
  if (address) headers.set("x-real-ip", address);
  return new Request(`${allowedOrigin()}/socket.io/`, { headers });
}

function acknowledge<T>(
  callback: SocketAckCallback<T> | undefined,
  result: SocketAck<T>,
) {
  if (callback) callback(result);
}

function socketError(error: unknown): SocketAck<never> {
  if (error instanceof AppError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "The communication event payload is invalid.",
    };
  }
  console.error("[communications] Socket event failed", {
    errorName: error instanceof Error ? error.name : "Unknown",
    errorMessage: error instanceof Error ? error.message : "Non-Error rejection",
  });
  return {
    ok: false,
    code: "INTERNAL_SERVER_ERROR",
    error: "The communication event could not be completed.",
  };
}

function emitSocketError(socket: CommunicationSocket, error: unknown) {
  const result = socketError(error);
  if (!result.ok) {
    socket.emit("socket:error", { code: result.code, message: result.error });
  }
}

async function limitEvent(
  socket: CommunicationSocket,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  await enforceRateLimit(
    socketRequest(socket),
    scope,
    socket.data.user.id,
    limit,
    windowSeconds,
  );
}

async function requireJoinedConversation(
  socket: CommunicationSocket,
  conversationId: string,
) {
  if (!socket.rooms.has(conversationRoom(conversationId))) {
    throw new AppError("CONVERSATION_NOT_JOINED", 403, "Join the conversation before sending events.");
  }
  return requireConversationParticipant(conversationId, socket.data.user);
}

const presenceSockets = new Map<string, Set<string>>();
const presenceUsers = new Map<string, { conversationId: string; user: AuthenticatedUser }>();

async function addPresence(socket: CommunicationSocket, conversationId: string) {
  const user = socket.data.user;
  const key = presenceKey(conversationId, user.id);
  const sockets = presenceSockets.get(key) ?? new Set<string>();
  const wasOffline = sockets.size === 0;
  sockets.add(socket.id);
  presenceSockets.set(key, sockets);
  presenceUsers.set(key, { conversationId, user });
  const presence = await updateConversationSocketPresence(user, conversationId, true);
  if (wasOffline) {
    const update = {
      conversationId,
      userId: user.id,
      status: "online" as const,
      lastSeenAt: presence.lastSeenAt,
    };
    getCommunicationSocketServer()?.to(conversationRoom(conversationId)).emit("presence:update", update);
    getCommunicationSocketServer()?.to(userRoom(presence.participantId)).emit("presence:online", {
      conversationId,
      userId: user.id,
    });
  }
  return { ...presence, peerState: await getConversationPresence(user, conversationId) };
}

async function removePresence(socket: CommunicationSocket, conversationId: string) {
  const user = socket.data.user;
  const key = presenceKey(conversationId, user.id);
  const sockets = presenceSockets.get(key);
  if (!sockets) return;
  sockets.delete(socket.id);
  if (sockets.size > 0) return;
  presenceSockets.delete(key);
  presenceUsers.delete(key);
  const presence = await updateConversationSocketPresence(user, conversationId, false);
  const io = getCommunicationSocketServer();
  if (!io) return;
  io.to(conversationRoom(conversationId)).emit("presence:update", {
    conversationId,
    userId: user.id,
    status: "offline",
    lastSeenAt: presence.lastSeenAt,
  });
  io.to(userRoom(presence.participantId)).emit("presence:offline", {
    conversationId,
    userId: user.id,
    lastSeenAt: presence.lastSeenAt,
  });
}

function registerConnection(io: CommunicationIo, socket: CommunicationSocket) {
  const user = socket.data.user;
  socket.join(userRoom(user.id));
  const authTimer = setInterval(() => {
    void requireUser(socketRequest(socket), ["CUSTOMER", "VENDOR"], { updateActivity: false })
      .then((currentUser) => {
        if (currentUser.id !== user.id || currentUser.sessionId !== user.sessionId) {
          socket.disconnect(true);
        }
      })
      .catch(() => socket.disconnect(true));
  }, 60_000);
  authTimer.unref();

  socket.on("conversation:join", async (payload, callback) => {
    try {
      const input = z.object({ conversationId: conversationIdSchema }).strict().parse(payload);
      await limitEvent(socket, "communication:socket-join", 60, 60);
      await requireConversationParticipant(input.conversationId, user);
      await socket.join(conversationRoom(input.conversationId));
      const presence = await addPresence(socket, input.conversationId);
      socket.emit("conversation:joined", { conversationId: input.conversationId });
      socket.emit("presence:update", {
        conversationId: input.conversationId,
        userId: presence.participantId,
        status: presence.peerState.status,
        lastSeenAt: presence.peerState.lastSeenAt,
      });
      acknowledge(callback, { ok: true, data: { conversationId: input.conversationId } });
    } catch (error) {
      acknowledge(callback, socketError(error));
    }
  });

  socket.on("conversation:leave", async (payload) => {
    const input = z.object({ conversationId: conversationIdSchema }).strict().safeParse(payload);
    if (!input.success || !socket.rooms.has(conversationRoom(input.data.conversationId))) return;
    await socket.leave(conversationRoom(input.data.conversationId));
    await removePresence(socket, input.data.conversationId);
  });

  socket.on("message:send", async (payload, callback) => {
    try {
      const input = messageSchema.parse(payload);
      await requireJoinedConversation(socket, input.conversationId);
      await limitEvent(socket, `communication:socket-message:${input.conversationId}`, 20, 60);
      const { message, duplicate } = await sendConversationMessage(user, input.conversationId, {
        clientMessageId: input.clientMessageId,
        content: input.content,
        productId: input.productId,
        orderId: input.orderId,
        location: input.location,
      });
      io.to(conversationRoom(input.conversationId)).emit("message:new", {
        conversationId: input.conversationId,
        message,
      });
      acknowledge(callback, { ok: true, data: { message, duplicate } });
    } catch (error) {
      acknowledge(callback, socketError(error));
    }
  });

  socket.on("message:read", async (payload) => {
    const input = z.object({ conversationId: conversationIdSchema }).strict().safeParse(payload);
    if (!input.success) return;
    try {
      await requireJoinedConversation(socket, input.data.conversationId);
      const read = await markConversationMessagesRead(user, input.data.conversationId);
      io.to(conversationRoom(input.data.conversationId)).emit("message:read", read);
    } catch (error) {
      emitSocketError(socket, error);
    }
  });

  for (const event of ["typing:start", "typing:stop"] as const) {
    socket.on(event, async (payload) => {
      const input = z.object({ conversationId: conversationIdSchema }).strict().safeParse(payload);
      if (!input.success || !socket.rooms.has(conversationRoom(input.data.conversationId))) return;
      try {
        await limitEvent(socket, `communication:${event}`, 60, 60);
        await requireConversationParticipant(input.data.conversationId, user);
        socket.to(conversationRoom(input.data.conversationId)).emit(event, {
          conversationId: input.data.conversationId,
          userId: user.id,
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });
  }

  socket.on("disconnecting", () => {
    clearInterval(authTimer);
    for (const room of socket.rooms) {
      if (room.startsWith("conversation:")) {
        const conversationId = room.slice("conversation:".length);
        void removePresence(socket, conversationId).catch((error: unknown) => {
          console.error("[communications] Socket presence cleanup failed", {
            errorName: error instanceof Error ? error.name : "Unknown",
          });
        });
      }
    }
  });
}

export function attachCommunicationSocketServer(
  httpServer: HttpServer,
  corsOrigin = allowedOrigin(),
) {
  if (globalThis.communicationSocketIo) return globalThis.communicationSocketIo;
  const io: CommunicationIo = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 64 * 1024,
  });
  io.use(async (socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin !== corsOrigin) {
      next(new Error("ORIGIN_FORBIDDEN"));
      return;
    }
    try {
      socket.data.user = await requireUser(socketRequest(socket), ["CUSTOMER", "VENDOR"]);
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });
  io.on("connection", (socket) => registerConnection(io, socket));
  globalThis.communicationSocketIo = io;
  const presenceTimer = setInterval(() => {
    for (const { conversationId, user } of presenceUsers.values()) {
      void updateConversationSocketPresence(user, conversationId, true).catch((error: unknown) => {
        console.error("[communications] Socket presence heartbeat failed", {
          errorName: error instanceof Error ? error.name : "Unknown",
        });
      });
    }
  }, 30_000);
  presenceTimer.unref();
  return io;
}

export function getCommunicationSocketServer() {
  return globalThis.communicationSocketIo;
}

export function emitConversationEvent(
  conversationId: string,
  event: keyof ServerToClientEvents,
  data: Parameters<ServerToClientEvents[typeof event]>[0],
) {
  const io = getCommunicationSocketServer();
  if (!io) return false;
  io.to(conversationRoom(conversationId)).emit(event, data as never);
  return true;
}
