"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ChatMessagePayload,
  NewMessagePayload,
  TypingPayload,
  OnlineStatusPayload,
} from "@/types/socket";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_PATH = "/api/socketio";
const SOCKET_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Singleton socket instance (lazy-initialized, client-side only) */
let socketInstance: TypedSocket | null = null;

/**
 * Get or create the singleton typed Socket.io client.
 * Requires auth data from the NextAuth session.
 */
export function getSocket(auth?: {
  userId: string;
  userName: string;
  email?: string;
  roles?: string[];
}): TypedSocket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      path: SOCKET_PATH,
      autoConnect: false,
      withCredentials: true,
      auth: auth || {},
    }) as TypedSocket;
  }
  return socketInstance;
}

/**
 * Disconnect and destroy the singleton socket instance.
 * Call when user logs out.
 */
export function destroySocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

// --- React Hooks ---

/**
 * React hook for Socket.io connection with authentication.
 * Connects on mount with user session data, disconnects on unmount.
 */
export function useSocket(auth?: {
  userId: string;
  userName: string;
  email?: string;
  roles?: string[];
}): { socket: TypedSocket | null; isConnected: boolean } {
  const socketRef = useRef<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!auth?.userId) return;

    const socket = getSocket(auth);
    socketRef.current = socket;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (!socket.connected) {
      socket.connect();
    } else {
      setIsConnected(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [auth?.userId, auth?.userName, auth?.email]);

  return { socket: socketRef.current, isConnected };
}

/**
 * React hook for group chat functionality.
 * Handles joining/leaving a group room, sending messages,
 * receiving new messages, typing indicators, and online presence.
 */
export function useGroupChat(
  groupId: string | null,
  auth?: { userId: string; userName: string; email?: string; roles?: string[] }
) {
  const { socket, isConnected } = useSocket(auth);
  const [messages, setMessages] = useState<NewMessagePayload[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Join/leave group room
  useEffect(() => {
    if (!socket || !isConnected || !groupId) return;

    socket.emit("join_group", groupId);

    return () => {
      socket.emit("leave_group", groupId);
    };
  }, [socket, isConnected, groupId]);

  // Listen for new messages
  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: NewMessagePayload) => {
      if (msg.groupId === groupId) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on("new_message", onNewMessage);
    return () => { socket.off("new_message", onNewMessage); };
  }, [socket, groupId]);

  // Listen for typing indicators
  useEffect(() => {
    if (!socket) return;

    const onTyping = (payload: TypingPayload) => {
      if (payload.groupId !== groupId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.isTyping) {
          next.set(payload.userId, payload.userName);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    };

    socket.on("typing", onTyping);
    return () => { socket.off("typing", onTyping); };
  }, [socket, groupId]);

  // Listen for online presence
  useEffect(() => {
    if (!socket) return;

    const onOnline = (payload: OnlineStatusPayload) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (payload.online) {
          next.add(payload.userId);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    };

    socket.on("online", onOnline);
    return () => { socket.off("online", onOnline); };
  }, [socket]);

  // Send message
  const sendMessage = useCallback(
    (payload: Omit<ChatMessagePayload, "groupId">) => {
      if (!socket || !groupId) return;
      socket.emit("send_message", { ...payload, groupId });
    },
    [socket, groupId]
  );

  // Send typing indicator
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket || !groupId) return;
      socket.emit("typing", { groupId, isTyping });
    },
    [socket, groupId]
  );

  return {
    socket,
    isConnected,
    messages,
    setMessages,
    typingUsers,
    onlineUserIds,
    sendMessage,
    sendTyping,
  };
}
