"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, MessageSquareText, Paperclip, Search, Send } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/hooks/use-translation";
import {
  postFormData,
  postJson,
  requestApi,
} from "@/lib/api/client";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
} from "@/features/communications/socket-events";
import { locationAttachmentSchema } from "@/features/communications/location";

const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
  isVendor: z.boolean(),
  logoUrl: z.string().nullable(),
});

const conversationSchema = z.object({
  id: z.string(),
  participant: participantSchema,
  latestMessage: z.object({
    id: z.string(),
    type: z.enum(["TEXT", "PRODUCT", "ORDER", "IMAGE", "SYSTEM"]),
    content: z.string().nullable(),
    attachmentData: z.unknown().nullable(),
    senderId: z.string(),
    createdAt: z.string(),
  }).nullable(),
  unreadCount: z.number(),
  updatedAt: z.string(),
});

const attachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  type: z.enum(["TEXT", "PRODUCT", "ORDER", "IMAGE", "SYSTEM"]),
  content: z.string().nullable(),
  attachmentData: z.unknown().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  attachments: z.array(attachmentSchema),
  sender: z.object({ id: z.string(), displayName: z.string().nullable() }),
});

const conversationsResponseSchema = z.object({
  conversations: z.array(conversationSchema),
});

const messagesResponseSchema = z.object({
  conversationId: z.string(),
  participant: participantSchema,
  messages: z.array(messageSchema),
  hasOlder: z.boolean(),
  nextCursor: z.string().nullable(),
  canSend: z.boolean(),
  blockedByCurrentUser: z.boolean(),
  blockedByOtherParticipant: z.boolean(),
});

const sendResponseSchema = z.object({
  message: messageSchema,
  duplicate: z.boolean(),
  liveDelivery: z.boolean().optional(),
});

const productListSchema = z.object({
  products: z.array(z.object({
    id: z.string(),
    name: z.string(),
    nameSo: z.string().nullable(),
    price: z.string().nullable(),
    imageUrl: z.string().nullable(),
  })),
});

const orderListSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    vendorOrderId: z.string(),
    orderNumber: z.string(),
    marketplaceStatus: z.string(),
    vendorOrderStatus: z.string(),
    createdAt: z.string(),
  })),
});

const reportResponseSchema = z.object({ reportId: z.string(), createdAt: z.string() });

type Message = z.infer<typeof messageSchema>;
type Conversation = z.infer<typeof conversationSchema>;
type AttachmentRecord = Record<string, unknown>;

const reportReasonKeys = {
  SPAM: "reportSpam",
  HARASSMENT: "reportHarassment",
  FRAUD: "reportFraud",
  IMPERSONATION: "reportImpersonation",
  INAPPROPRIATE_CONTENT: "reportInappropriate",
  OTHER: "reportOther",
} as const;

export function ConversationInbox({
  audience,
  locale,
  userId,
  initialConversationId,
}: Readonly<{
  audience: "CUSTOMER" | "VENDOR";
  locale: Locale;
  userId: string;
  initialConversationId?: string;
}>) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState(initialConversationId ?? "");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [blockedByCurrentUser, setBlockedByCurrentUser] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [participant, setParticipant] = useState<z.infer<typeof participantSchema> | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<"online" | "away" | "offline">("offline");
  const [liveConnected, setLiveConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveWarning, setLiveWarning] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [socket, setSocket] = useState<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [products, setProducts] = useState<z.infer<typeof productListSchema>["products"]>([]);
  const [orders, setOrders] = useState<z.infer<typeof orderListSchema>["orders"]>([]);
  const [sharePanel, setSharePanel] = useState<"products" | "orders" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<keyof typeof reportReasonKeys>("SPAM");
  const [reportExplanation, setReportExplanation] = useState("");
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [presenceLastSeen, setPresenceLastSeen] = useState<string | null>(null);
  const [locationPreview, setLocationPreview] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastTypingSentAt = useRef(0);
  const selectedIdRef = useRef(selectedId);
  const outgoingTypingTimer = useRef<number | null>(null);
  const incomingTypingTimer = useRef<number | null>(null);
  const loadedConversationIdRef = useRef<string | null>(null);
  const listPath = "/api/v1/conversations";
  const messagesPath = selectedId
    ? `/api/v1/conversations/${selectedId}/messages`
    : null;
  const conversationReady = loadedConversationId === selectedId;
  const visibleMessages = conversationReady ? messages : [];
  const visibleParticipant = conversationReady ? participant : null;
  const visibleHasOlder = conversationReady && hasOlder;
  const visibleNextCursor = conversationReady ? nextCursor : null;
  const visibleCanSend = conversationReady && canSend;
  const visibleBlockedByCurrentUser = conversationReady && blockedByCurrentUser;
  const visibleBlockedByOther = conversationReady && blockedByOther;

  const loadConversations = useCallback(async () => {
    const result = await requestApi(
      `${listPath}?${new URLSearchParams(search ? { q: search } : {})}`,
      conversationsResponseSchema,
      t("auth.requestFailed"),
    );
    setConversations(result.conversations);
    setSelectedId((current) => {
      if (current && result.conversations.some((conversation) => conversation.id === current)) {
        return current;
      }
      if (initialConversationId && result.conversations.some((conversation) => conversation.id === initialConversationId)) {
        return initialConversationId;
      }
      return current || result.conversations[0]?.id || "";
    });
  }, [initialConversationId, listPath, search, t]);

  const loadMessages = useCallback(async () => {
    if (!messagesPath) return;
    try {
      const result = await requestApi(messagesPath, messagesResponseSchema, t("auth.requestFailed"));
      if (selectedIdRef.current !== selectedId) return;
      const currentConversationId = loadedConversationIdRef.current;
      loadedConversationIdRef.current = selectedId;
      setLoadedConversationId(selectedId);
      setParticipant(result.participant);
      setCanSend(result.canSend);
      setBlockedByCurrentUser(result.blockedByCurrentUser);
      setBlockedByOther(result.blockedByOtherParticipant);
      setHasOlder(result.hasOlder);
      setNextCursor(result.nextCursor);
      setMessages((current) => {
        const firstNewMessage = result.messages[0];
        const existingMessages = currentConversationId === selectedId ? current : [];
        const olderMessages = firstNewMessage
          ? existingMessages.filter((message) => message.createdAt < firstNewMessage.createdAt)
          : existingMessages;
        const combined = new Map<string, Message>();
        for (const message of [...olderMessages, ...result.messages]) {
          combined.set(message.id, message);
        }
        return [...combined.values()].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        );
      });
      setError(null);
    } catch (reason) {
      if (selectedIdRef.current !== selectedId) return;
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }, [messagesPath, selectedId, t]);

  const loadConversationsRef = useRef(loadConversations);
  const loadMessagesRef = useRef(loadMessages);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    loadConversationsRef.current = loadConversations;
    loadMessagesRef.current = loadMessages;
  }, [loadConversations, loadMessages, selectedId]);

  useVisiblePolling(loadConversations, 30_000);
  useVisiblePolling(loadMessages, 5_000, Boolean(selectedId));
  useVisiblePolling(async () => {
    if (!selectedId) return;
    const presence = await requestApi(
      `/api/v1/conversations/${selectedId}/presence`,
      z.object({
        status: z.enum(["online", "away", "offline"]),
        lastSeenAt: z.string().nullable(),
      }),
      t("auth.requestFailed"),
    );
    setOnlineStatus(presence.status);
    setPresenceLastSeen(presence.lastSeenAt);
  }, 20_000, Boolean(selectedId));

  useEffect(() => {
    const connection = io({
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10_000,
    });
    const joinSelectedConversation = () => {
      const conversationId = selectedIdRef.current;
      if (!conversationId) return;
      connection.emit("conversation:join", { conversationId }, (result: SocketAck<{ conversationId: string }>) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        connection.emit("message:read", { conversationId });
      });
    };
    const onMessage = (data: { conversationId: string }) => {
      if (data.conversationId === selectedIdRef.current) {
        void loadMessagesRef.current();
      }
      void loadConversationsRef.current();
    };
    const onTypingStart = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId !== selectedIdRef.current || data.userId === userId) return;
      setTyping(true);
    if (incomingTypingTimer.current !== null) window.clearTimeout(incomingTypingTimer.current);
    incomingTypingTimer.current = window.setTimeout(() => setTyping(false), 2500);
    };
    const onTypingStop = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === selectedIdRef.current && data.userId !== userId) {
        setTyping(false);
      }
    };
    const onPresence = (data: {
      conversationId: string;
      userId: string;
      status: "online" | "away" | "offline";
      lastSeenAt: string | null;
    }) => {
      if (data.conversationId !== selectedIdRef.current || data.userId === userId) return;
      setOnlineStatus(data.status);
      setPresenceLastSeen(data.lastSeenAt);
    };
    connection.on("connect", () => {
      setSocket(connection);
      setLiveConnected(true);
      setLiveWarning(false);
      joinSelectedConversation();
    });
    connection.on("disconnect", () => {
      setLiveConnected(false);
      setLiveWarning(true);
    });
    connection.on("connect_error", (reason) => {
      console.error("[communications] Socket.IO connection failed", reason);
      setLiveConnected(false);
      setLiveWarning(true);
    });
    connection.on("message:new", onMessage);
    connection.on("message:read", onMessage);
    connection.on("conversation:updated", () => void loadConversationsRef.current());
    connection.on("typing:start", onTypingStart);
    connection.on("typing:stop", onTypingStop);
    connection.on("presence:update", onPresence);
    connection.on("socket:error", (payload) => {
      setError(payload.message);
    });
    return () => {
      if (incomingTypingTimer.current !== null) window.clearTimeout(incomingTypingTimer.current);
      if (outgoingTypingTimer.current !== null) window.clearTimeout(outgoingTypingTimer.current);
      connection.disconnect();
    };
  }, [userId]);

  useEffect(() => {
    if (!selectedId) return;
    void Promise.resolve().then(loadMessages);
    if (!socket?.connected) return;
    socket.emit("conversation:join", { conversationId: selectedId }, (result) => {
      if (!result.ok) setError(result.error);
      else socket.emit("message:read", { conversationId: selectedId });
    });
    return () => {
      socket.emit("conversation:leave", { conversationId: selectedId });
    };
  }, [loadMessages, selectedId, socket]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length]);

  async function sendMessage(payload: {
    content?: string;
    productId?: string;
    orderId?: string;
    location?: { latitude: number; longitude: number };
  }) {
    if (!selectedId || !visibleCanSend || sending) return;
    setSending(true);
    setError(null);
    try {
      const clientMessageId = crypto.randomUUID();
      let result: z.infer<typeof sendResponseSchema> | undefined;
      if (socket?.connected) {
        let acknowledgement;
        try {
          acknowledgement = await socket.timeout(10_000).emitWithAck("message:send", {
            conversationId: selectedId,
            clientMessageId,
            ...payload,
          });
        } catch {
          acknowledgement = undefined;
        }
        if (acknowledgement && !acknowledgement.ok) {
          throw new Error(acknowledgement.error);
        }
        if (acknowledgement?.ok) {
          result = sendResponseSchema.parse({
            ...acknowledgement.data,
            liveDelivery: true,
          });
        }
      }
      result ??= await requestApi(
        `/api/v1/conversations/${selectedId}/messages`,
        sendResponseSchema,
        t("auth.requestFailed"),
        postJson({ ...payload, clientMessageId }),
      );
      setMessages((current) => current.some((message) => message.id === result.message.id)
        ? current
        : [...current, result.message]);
      setLiveWarning(!result.liveDelivery);
      setSharePanel(null);
      setLocationPreview(null);
      setLocationError(null);
      setDraft("");
      socket?.emit("typing:stop", { conversationId: selectedId });
      void loadConversations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    } finally {
      setSending(false);
    }
  }

  function previewCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError(t("communications.locationUnavailable"));
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationPreview({
          latitude: Number(coords.latitude.toFixed(4)),
          longitude: Number(coords.longitude.toFixed(4)),
        });
        setLocationLoading(false);
      },
      (reason) => {
        setLocationError(
          reason.code === GeolocationPositionError.PERMISSION_DENIED
            ? t("communications.locationPermissionDenied")
            : t("communications.locationFailed"),
        );
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  }

  async function sendImage(file: File) {
    if (!selectedId || !visibleCanSend || sending) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("clientMessageId", crypto.randomUUID());
    try {
      const result = await requestApi(
        `/api/v1/conversations/${selectedId}/images`,
        sendResponseSchema,
        t("communications.uploadFailed"),
        postFormData(form),
      );
      setMessages((current) => [...current, result.message]);
      setLiveWarning(!result.liveDelivery);
      void loadConversations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("communications.uploadFailed"));
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openSharePanel(kind: "products" | "orders") {
    if (!selectedId) return;
    if (sharePanel === kind) {
      setSharePanel(null);
      return;
    }
    setSharePanel(kind);
    try {
      if (kind === "products") {
        const result = await requestApi(
          `/api/v1/conversations/${selectedId}/products`,
          productListSchema,
          t("auth.requestFailed"),
        );
        setProducts(result.products);
      } else {
        const result = await requestApi(
          `/api/v1/conversations/${selectedId}/orders`,
          orderListSchema,
          t("auth.requestFailed"),
        );
        setOrders(result.orders);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  async function reportParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || reporting) return;
    setReporting(true);
    setReportMessage(null);
    try {
      await requestApi(
        `/api/v1/conversations/${selectedId}/reports`,
        reportResponseSchema,
        t("communications.reportFailed"),
        postJson({ reason: reportReason, explanation: reportExplanation }),
      );
      setReportMessage(t("communications.reportSubmitted"));
      setReportExplanation("");
      setReportOpen(false);
    } catch (reason) {
      setReportMessage(reason instanceof Error ? reason.message : t("communications.reportFailed"));
    } finally {
      setReporting(false);
    }
  }

  async function blockParticipant() {
    if (!selectedId || visibleBlockedByCurrentUser) return;
    try {
      await requestApi(
        `/api/v1/conversations/${selectedId}/block`,
        z.object({ blockedUserId: z.string() }),
        t("auth.requestFailed"),
        postJson({}),
      );
      setBlockedByCurrentUser(true);
      setCanSend(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.requestFailed"));
    }
  }

  function sendTyping() {
    const now = Date.now();
    if (!socket?.connected || !selectedId) return;
    if (now - lastTypingSentAt.current >= 1200) {
      lastTypingSentAt.current = now;
      socket.emit("typing:start", { conversationId: selectedId });
    }
    if (outgoingTypingTimer.current !== null) window.clearTimeout(outgoingTypingTimer.current);
    outgoingTypingTimer.current = window.setTimeout(() => {
      socket.emit("typing:stop", { conversationId: selectedId });
      outgoingTypingTimer.current = null;
    }, 1200);
  }

  async function loadOlderMessages() {
    if (!selectedId || !visibleNextCursor || sending) return;
    const conversationId = selectedId;
    const result = await requestApi(
      `/api/v1/conversations/${conversationId}/messages?before=${encodeURIComponent(visibleNextCursor)}`,
      messagesResponseSchema,
      t("auth.requestFailed"),
    );
    if (selectedIdRef.current !== conversationId) return;
    setMessages((current) => {
      const combined = new Map<string, Message>();
      for (const message of [...result.messages, ...current]) combined.set(message.id, message);
      return [...combined.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
    setHasOlder(result.hasOlder);
    setNextCursor(result.nextCursor);
  }

  return (
    <main data-audience={audience.toLowerCase()} className="mx-auto max-w-[90rem] px-3 py-5 sm:px-6 lg:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#123b35]">{t("communications.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("communications.messages")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${liveConnected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
          {liveConnected ? t("communications.liveConnected") : t("communications.liveDisconnected")}
        </span>
      </header>
      {liveWarning && !liveConnected && (
        <p role="status" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("communications.liveSavedFallback")}
        </p>
      )}
      {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <div className="grid min-h-[70vh] overflow-hidden rounded-2xl border border-[#dce4e1] bg-white shadow-sm md:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className={`${selectedId ? "hidden md:flex" : "flex"} min-h-[70vh] flex-col border-e border-[#e1e9e5]`}>
          <label className="relative m-3">
            <Search aria-hidden="true" className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("communications.searchPlaceholder")}
              aria-label={t("communications.search")}
              className="min-h-11 w-full rounded-xl border border-[#dce4e1] bg-[#f8faf9] ps-9 pe-3 text-sm outline-none focus:border-[#123b35]"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`flex w-full items-center gap-3 border-t border-[#edf1ef] p-4 text-start transition hover:bg-[#f5f8f6] ${selectedId === conversation.id ? "bg-[#f5f8f6]" : "bg-white"}`}
              >
                <ParticipantAvatar participant={conversation.participant} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-[#123b35]">{conversation.participant.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{formatTime(conversation.updatedAt, locale)}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-600">
                    {conversation.latestMessage?.content ?? previewAttachment(conversation.latestMessage?.type, conversation.latestMessage?.attachmentData, t)}
                  </span>
                </span>
                {conversation.unreadCount > 0 && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#123b35] text-[10px] font-bold text-white">
                    {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                  </span>
                )}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-600">{t("communications.emptyConversations")}</p>
            )}
          </div>
        </aside>
        <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
          {selectedId && visibleParticipant ? (
            <>
              <header className="flex items-center gap-3 border-b border-[#e1e9e5] px-4 py-3">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-[#123b35] md:hidden"
                  onClick={() => setSelectedId("")}
                  aria-label={t("communications.messages")}
                >
                  ←
                </button>
                <ParticipantAvatar participant={visibleParticipant} />
                <div className="min-w-0 flex-1">
                  {visibleParticipant.isVendor
                    ? <Link href={`/${locale}/stores/${visibleParticipant.id}`} className="block truncate font-bold text-[#123b35] hover:underline">{visibleParticipant.name}</Link>
                    : <Link href={`/${locale}/users/${visibleParticipant.id}`} className="block truncate font-bold text-[#123b35] hover:underline">{visibleParticipant.name}</Link>}
                  <p className="text-xs text-slate-600">
                    {typing
                      ? `${visibleParticipant.name}…`
                      : t(`communications.${onlineStatus}`)}
                    {onlineStatus === "offline" && presenceLastSeen
                      ? ` · ${t("communications.lastSeen")} ${formatTime(presenceLastSeen, locale)}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="rounded-lg border border-[#dce4e1] px-3 py-2 text-xs font-semibold text-[#123b35] hover:bg-[#f5f8f6]"
                >
                  {t("communications.report")}
                </button>
                <button
                  type="button"
                  onClick={() => void blockParticipant()}
                  disabled={visibleBlockedByCurrentUser}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                >
                  {visibleBlockedByCurrentUser ? t("communications.blocked") : t("communications.block")}
                </button>
              </header>
              {visibleBlockedByCurrentUser || visibleBlockedByOther ? (
                <p className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                  {t("communications.blocked")}
                </p>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafcfb] px-3 py-4 sm:px-6">
                {visibleHasOlder && (
                  <button type="button" onClick={() => void loadOlderMessages()} className="mx-auto mb-4 rounded-lg border border-[#dce4e1] bg-white px-3 py-2 text-xs font-semibold text-[#123b35]">
                    {t("communications.olderMessages")}
                  </button>
                )}
                {visibleMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} own={message.senderId === userId} conversationId={selectedId} locale={locale} t={t} />
                ))}
                <div ref={messageEndRef} />
              </div>
              {reportMessage && <p role="status" className="px-4 py-2 text-sm text-emerald-800">{reportMessage}</p>}
              <div className="border-t border-[#e1e9e5] bg-white p-3 sm:p-4">
                {sharePanel && (
                  <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-[#e1e9e5] bg-[#f8faf9] p-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-xs font-bold text-[#123b35]">{t(sharePanel === "products" ? "communications.shareProduct" : "communications.shareOrder")}</p>
                      <button type="button" onClick={() => setSharePanel(null)} className="text-xs text-slate-600">×</button>
                    </div>
                    {sharePanel === "products" ? products.map((product) => (
                      <button key={product.id} type="button" disabled={sending} onClick={() => void sendMessage({ productId: product.id })} className="flex w-full items-center gap-3 rounded-lg p-2 text-start hover:bg-white disabled:opacity-50">
                        {product.imageUrl && <Image src={product.imageUrl} alt="" width={40} height={40} unoptimized className="size-10 rounded-lg object-cover" />}
                        <span className="min-w-0 flex-1 truncate text-sm">{locale === "so" ? product.nameSo ?? product.name : product.name}</span>
                        <span className="text-xs font-semibold">${product.price ?? "—"}</span>
                      </button>
                    )) : orders.map((order) => (
                      <button key={order.id} type="button" disabled={sending} onClick={() => void sendMessage({ orderId: order.id })} className="flex w-full items-center justify-between rounded-lg p-3 text-start text-sm hover:bg-white disabled:opacity-50">
                        <span className="font-semibold">{order.orderNumber}</span>
                        <span className="text-xs text-slate-600">{order.vendorOrderStatus.replaceAll("_", " ")}</span>
                      </button>
                    ))}
                    {sharePanel === "products" && products.length === 0 && <p className="p-3 text-xs text-slate-600">{t("communications.productUnavailable")}</p>}
                    {sharePanel === "orders" && orders.length === 0 && <p className="p-3 text-xs text-slate-600">{t("communications.orderAttachment")}: —</p>}
                  </div>
                )}
                <div className="mb-2 flex flex-wrap gap-2">
                  <button type="button" disabled={!visibleCanSend} onClick={() => void openSharePanel("products")} className="rounded-lg border border-[#dce4e1] px-3 py-1.5 text-xs font-semibold text-[#123b35] disabled:opacity-50">{t("communications.shareProduct")}</button>
                  <button type="button" disabled={!visibleCanSend} onClick={() => void openSharePanel("orders")} className="rounded-lg border border-[#dce4e1] px-3 py-1.5 text-xs font-semibold text-[#123b35] disabled:opacity-50">{t("communications.shareOrder")}</button>
                  <button type="button" disabled={!visibleCanSend || locationLoading} onClick={previewCurrentLocation} className="flex items-center gap-1 rounded-lg border border-[#dce4e1] px-3 py-1.5 text-xs font-semibold text-[#123b35] disabled:opacity-50"><MapPin aria-hidden="true" className="size-3.5" />{locationLoading ? t("communications.locationLoading") : t("communications.shareLocation")}</button>
                  <button type="button" disabled={!visibleCanSend} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-[#dce4e1] px-3 py-1.5 text-xs font-semibold text-[#123b35] disabled:opacity-50"><Paperclip className="size-3.5" />{t("communications.sendImage")}</button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("communications.sendImage")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendImage(file); }} />
                </div>
                {locationError && <p role="alert" className="mb-2 text-sm text-red-700">{locationError}</p>}
                {locationPreview && (
                  <div className="mb-3 rounded-xl border border-[#dce4e1] bg-[#f8faf9] p-3">
                    <p className="text-sm font-semibold text-[#123b35]">{t("communications.locationPreview")}</p>
                    <p className="mt-1 text-xs text-slate-600">{locationPreview.latitude.toFixed(4)}, {locationPreview.longitude.toFixed(4)}</p>
                    <p className="mt-1 text-xs text-slate-600">{t("communications.locationConsent")}</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setLocationPreview(null)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{t("communications.cancel")}</button>
                      <button type="button" disabled={sending || !visibleCanSend} onClick={() => void sendMessage({ location: locationPreview })} className="rounded-lg bg-[#123b35] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t("communications.sendLocation")}</button>
                    </div>
                  </div>
                )}
                <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void sendMessage({ content: draft }); }} className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => { setDraft(event.target.value); sendTyping(); }}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim()) void sendMessage({ content: draft }); } }}
                    maxLength={4000}
                    rows={2}
                    disabled={!visibleCanSend}
                    placeholder={visibleCanSend ? t("communications.messagePlaceholder") : t("communications.blocked")}
                    className="min-h-12 min-w-0 flex-1 resize-none rounded-xl border border-[#dce4e1] px-3 py-2 text-sm outline-none focus:border-[#123b35] disabled:bg-slate-100"
                  />
                  <button type="submit" disabled={!draft.trim() || sending || !visibleCanSend} className="flex min-h-12 items-center gap-2 rounded-xl bg-[#123b35] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <Send aria-hidden="true" className="size-4" />{t("communications.send")}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="grid min-h-[70vh] place-items-center p-8 text-center">
              <div>
                <MessageSquareText aria-hidden="true" className="mx-auto size-10 text-[#8fa49b]" />
                <p className="mt-3 text-sm text-slate-600">{t("communications.selectConversation")}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {reportOpen && selectedId && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
          <form onSubmit={(event) => void reportParticipant(event)} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-[#123b35]">{t("communications.reportTitle")}</h2>
            <label className="mt-4 grid gap-1 text-sm font-semibold">
              {t("communications.reportReason")}
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value as keyof typeof reportReasonKeys)} className="min-h-11 rounded-lg border border-[#dce4e1] px-3">
                {Object.entries(reportReasonKeys).map(([reason, key]) => <option key={reason} value={reason}>{t(`communications.${key}`)}</option>)}
              </select>
            </label>
            <label className="mt-3 grid gap-1 text-sm font-semibold">
              {t("communications.reportExplanation")}
              <textarea value={reportExplanation} onChange={(event) => setReportExplanation(event.target.value)} maxLength={2000} rows={4} className="rounded-lg border border-[#dce4e1] p-3 text-sm font-normal" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">{t("communications.cancel")}</button>
              <button type="submit" disabled={reporting} className="rounded-lg bg-[#123b35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("communications.report")}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function ParticipantAvatar({ participant }: { participant: z.infer<typeof participantSchema> }) {
  return participant.logoUrl
    ? <Image src={participant.logoUrl} alt="" width={42} height={42} unoptimized className="size-11 shrink-0 rounded-full border border-[#e1e9e5] object-cover" />
    : <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#123b35] text-sm font-bold text-[#f4b942]">{participant.name.slice(0, 1).toUpperCase()}</span>;
}

function MessageBubble({
  message,
  own,
  conversationId,
  locale,
  t,
}: {
  message: Message;
  own: boolean;
  conversationId: string;
  locale: Locale;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const attachment = z.record(z.string(), z.unknown()).safeParse(message.attachmentData);
  const data: AttachmentRecord = attachment.success ? attachment.data : {};
  const productName = locale === "so" && typeof data.nameSo === "string"
    ? data.nameSo
    : typeof data.name === "string"
      ? data.name
      : "";
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl : null;
  const productHref = typeof data.href === "string" ? `/${locale}${data.href}` : null;
  const availability = typeof data.availability === "string" ? data.availability : "";
  const location = locationAttachmentSchema.safeParse(data);

  return (
    <article className={`mb-3 flex ${own ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[75%] ${own ? "rounded-ee-sm bg-[#123b35] text-white" : "rounded-es-sm border border-[#e1e9e5] bg-white text-[#123b35]"}`}>
        {message.type === "PRODUCT" && (
          <Link href={productHref ?? "#"} className="block min-w-56 max-w-sm rounded-xl border border-white/20 p-2">
            {imageUrl && <Image src={imageUrl} alt="" width={320} height={180} unoptimized className="mb-2 h-32 w-full rounded-lg object-cover" />}
            <p className="font-bold">{productName}</p>
            {typeof data.price === "string" && <p className="mt-1 text-sm">${data.price}</p>}
            {availability === "SOLD_OUT" && <p className="mt-1 text-xs text-amber-700">{t("communications.productSoldOut")}</p>}
            {(availability === "UNAVAILABLE" || availability === "") && <p className="mt-1 text-xs text-amber-700">{t("communications.productUnavailable")}</p>}
            {typeof data.storeName === "string" && <p className="mt-1 text-xs opacity-80">{data.storeName}</p>}
          </Link>
        )}
        {message.type === "ORDER" && (
          <Link href={productHref ?? "#"} className="block min-w-56 rounded-xl border border-white/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{t("communications.orderAttachment")}</p>
            <p className="mt-1 font-bold">{typeof data.orderNumber === "string" ? data.orderNumber : ""}</p>
            <p className="mt-1 text-sm">{typeof data.vendorOrderStatus === "string" ? data.vendorOrderStatus.replaceAll("_", " ") : ""}</p>
            {Array.isArray(data.items) && <p className="mt-1 text-xs opacity-75">{data.items.length} item(s)</p>}
          </Link>
        )}
        {location.success && (
          <div className="min-w-56 rounded-xl border border-white/20 p-3">
            <p className="flex items-center gap-2 font-semibold"><MapPin aria-hidden="true" className="size-4" />{t("communications.sharedLocation")}</p>
            <p className="mt-1 text-xs opacity-75">{location.data.latitude.toFixed(4)}, {location.data.longitude.toFixed(4)}</p>
            <a href={location.data.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold underline">
              {t("communications.openMap")}
            </a>
          </div>
        )}
        {message.type === "IMAGE" && message.attachments.map((file) => (
          <Image
            key={file.id}
            src={`/api/v1/conversations/${conversationId}/attachments/${file.id}`}
            alt={file.originalName}
            width={480}
            height={360}
            unoptimized
            className="max-h-72 w-auto max-w-full rounded-xl object-contain"
          />
        ))}
        {message.content && <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
        {message.type === "SYSTEM" && <p className="text-xs italic opacity-80">{message.content}</p>}
        <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? "text-white/65" : "text-slate-500"}`}>
          {new Date(message.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          {own && message.readAt ? " · ✓✓" : own && message.deliveredAt ? " · ✓" : ""}
        </p>
      </div>
    </article>
  );
}

function formatTime(value: string, locale: Locale) {
  return new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function previewAttachment(
  type: string | undefined,
  attachmentData: unknown,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (type === "PRODUCT") return t("communications.shareProduct");
  if (type === "ORDER") return t("communications.orderAttachment");
  if (type === "IMAGE") return t("communications.sendImage");
  if (type === "TEXT" && locationAttachmentSchema.safeParse(attachmentData).success) {
    return t("communications.sharedLocation");
  }
  return "";
}
