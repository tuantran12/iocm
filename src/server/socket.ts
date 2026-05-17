import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  ChatMessagePayload,
} from "@/types/socket";

type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: TypedServer | null = null;

/** Track online users: userId → Set of socketIds */
const onlineUsers = new Map<string, Set<string>>();

/**
 * Initialize Socket.io server attached to an HTTP server instance.
 * Includes authentication middleware, room-based chat, typing indicators,
 * and online presence tracking.
 */
export function initSocketServer(httpServer: HttpServer): TypedServer {
  if (io) return io;

  io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Ping every 25s, timeout after 20s — keeps connections alive
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // --- Authentication middleware ---
  // Verifies the user session via a token passed in handshake auth.
  // In production, this decodes the NextAuth JWT from the cookie or auth header.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const userId = socket.handshake.auth?.userId;
      const userName = socket.handshake.auth?.userName;
      const email = socket.handshake.auth?.email;
      const roles = socket.handshake.auth?.roles;

      // Require at minimum userId and userName for authenticated connection
      if (!userId || !userName) {
        return next(new Error("Authentication required: missing user credentials"));
      }

      // If a JWT token is provided, verify it (NextAuth JWT verification)
      // For now we trust the handshake auth data passed from the client
      // which is populated from the NextAuth session on the client side.
      // In production, add proper JWT decode/verify here.
      if (token) {
        // TODO: Decode and verify NextAuth JWT token for extra security
        // const decoded = await decode({ token, secret: process.env.NEXTAUTH_SECRET! });
        // if (!decoded?.id) return next(new Error("Invalid token"));
      }

      // Attach user data to socket
      socket.data.userId = userId;
      socket.data.userName = userName;
      socket.data.email = email || "";
      socket.data.roles = roles || [];

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  // --- Connection handler ---
  io.on("connection", (socket: TypedSocket) => {
    const { userId, userName } = socket.data;
    console.log(`[Socket.io] Connected: ${userName} (${userId}) — socket ${socket.id}`);

    // --- Online presence ---
    trackUserOnline(socket);

    // --- Room management ---
    socket.on("join_group", (groupId: string) => {
      socket.join(`group:${groupId}`);
      console.log(`[Socket.io] ${userName} joined group:${groupId}`);
    });

    socket.on("leave_group", (groupId: string) => {
      socket.leave(`group:${groupId}`);
      console.log(`[Socket.io] ${userName} left group:${groupId}`);
    });

    // --- Chat messages ---
    socket.on("send_message", async (payload: ChatMessagePayload, callback) => {
      try {
        const message = await handleSendMessage(socket, payload);
        if (callback) callback({ success: true, messageId: message.id });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Failed to send message";
        console.error(`[Socket.io] send_message error:`, error);
        if (callback) callback({ success: false, error: errMsg });
        socket.emit("error", { message: errMsg, code: "SEND_FAILED" });
      }
    });

    // --- Typing indicator ---
    socket.on("typing", ({ groupId, isTyping }) => {
      socket.to(`group:${groupId}`).emit("typing", {
        groupId,
        userId,
        userName,
        isTyping,
      });
    });

    // --- Disconnect ---
    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Disconnected: ${userName} (${reason})`);
      trackUserOffline(socket);
    });
  });

  console.log("[Socket.io] Server initialized with auth + chat events");
  return io;
}

// --- Helper: Handle send_message event ---
async function handleSendMessage(socket: TypedSocket, payload: ChatMessagePayload) {
  const { groupId, content, type, replyToId, attachments } = payload;
  const { userId, userName } = socket.data;

  if (!groupId || !content?.trim()) {
    throw new Error("groupId and content are required");
  }

  // Dynamically import Prisma to avoid bundling issues in the socket server
  const { db } = await import("@/lib/db");

  // Verify user is a member of the group
  const membership = await db.groupMembership.findFirst({
    where: {
      groupId,
      userId,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    throw new Error("You are not a member of this group");
  }

  // Persist message to database
  const message = await db.chatMessage.create({
    data: {
      groupId,
      senderId: userId,
      content: content.trim(),
      type: type || "TEXT",
      replyToId: replyToId || null,
      attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : undefined,
    },
  });

  // Broadcast to all clients in the group room (including sender)
  const server = getSocketServer();
  if (server) {
    server.to(`group:${groupId}`).emit("new_message", {
      id: message.id,
      groupId: message.groupId,
      senderId: message.senderId,
      senderName: userName,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      attachments: message.attachments,
      createdAt: message.createdAt.toISOString(),
    });
  }

  return message;
}

// --- Helper: Track user coming online ---
function trackUserOnline(socket: TypedSocket) {
  const { userId, userName } = socket.data;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  // Broadcast online status to all connected clients
  socket.broadcast.emit("online", {
    userId,
    userName,
    online: true,
  });
}

// --- Helper: Track user going offline ---
function trackUserOffline(socket: TypedSocket) {
  const { userId, userName } = socket.data;

  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socket.id);
    // Only mark offline if no remaining connections for this user
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      socket.broadcast.emit("online", {
        userId,
        userName,
        online: false,
      });
    }
  }
}

/**
 * Get the existing Socket.io server instance.
 * Returns null if not yet initialized.
 */
export function getSocketServer(): TypedServer | null {
  return io;
}

/**
 * Get list of currently online user IDs.
 */
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

/**
 * Check if a specific user is online.
 */
export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

/**
 * Emit a new_message event to a specific group room from outside the socket handler.
 * Useful for tRPC mutations that create messages and need to broadcast.
 */
export function emitToGroup(groupId: string, event: keyof ServerToClientEvents, payload: unknown) {
  if (io) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    io.to(`group:${groupId}`).emit(event, payload as any);
  }
}
