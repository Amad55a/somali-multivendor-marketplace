import type { AuthenticatedUser } from "@/features/auth/sessions";

export type SocketAck<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

export type SocketAckCallback<T = unknown> = (result: SocketAck<T>) => void;

export interface ClientToServerEvents {
  "conversation:join": (
    payload: { conversationId: string },
    acknowledge?: SocketAckCallback<{ conversationId: string }>,
  ) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;
  "message:send": (
    payload: {
      conversationId: string;
      clientMessageId: string;
      content?: string;
      productId?: string;
      orderId?: string;
      location?: { latitude: number; longitude: number };
    },
    acknowledge?: SocketAckCallback<{ message: unknown; duplicate: boolean }>,
  ) => void;
  "message:read": (payload: { conversationId: string }) => void;
  "typing:start": (payload: { conversationId: string }) => void;
  "typing:stop": (payload: { conversationId: string }) => void;
}

export interface ServerToClientEvents {
  "conversation:joined": (payload: { conversationId: string }) => void;
  "conversation:updated": (payload: { conversationId: string }) => void;
  "message:new": (payload: { conversationId: string; message: unknown }) => void;
  "message:read": (payload: { conversationId: string; readerId: string; readAt: string }) => void;
  "typing:start": (payload: { conversationId: string; userId: string }) => void;
  "typing:stop": (payload: { conversationId: string; userId: string }) => void;
  "presence:update": (payload: {
    conversationId: string;
    userId: string;
    status: "online" | "away" | "offline";
    lastSeenAt: string | null;
  }) => void;
  "presence:online": (payload: { conversationId: string; userId: string }) => void;
  "presence:offline": (payload: { conversationId: string; userId: string; lastSeenAt: string }) => void;
  "socket:error": (payload: { code: string; message: string }) => void;
}

export interface CommunicationSocketData {
  user: AuthenticatedUser;
}
