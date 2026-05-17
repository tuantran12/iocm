/**
 * Shared Socket.io event type definitions for client ↔ server communication.
 * Used by both src/server/socket.ts and src/lib/socket.ts.
 */

// --- Payload types ---

export interface ChatMessagePayload {
  groupId: string;
  content: string;
  type?: "TEXT" | "FILE" | "LINK" | "SYSTEM_NOTICE" | "TASK_REF" | "DECISION_REF" | "POLL";
  replyToId?: string;
  attachments?: { name: string; url: string; size: number }[];
}

export interface NewMessagePayload {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  replyToId?: string | null;
  attachments?: unknown;
  createdAt: string;
}

export interface TypingPayload {
  groupId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface OnlineStatusPayload {
  userId: string;
  userName: string;
  online: boolean;
}

export interface MessageEditedPayload {
  id: string;
  groupId: string;
  content: string;
  editedAt: string;
}

export interface MessageDeletedPayload {
  id: string;
  groupId: string;
  deletedAt: string;
}

export interface MessagePinnedPayload {
  id: string;
  groupId: string;
  pinned: boolean;
}

// --- Client → Server events ---

export interface ClientToServerEvents {
  join_group: (groupId: string) => void;
  leave_group: (groupId: string) => void;
  send_message: (payload: ChatMessagePayload, callback?: (response: { success: boolean; messageId?: string; error?: string }) => void) => void;
  typing: (payload: { groupId: string; isTyping: boolean }) => void;
}

// --- Server → Client events ---

export interface ServerToClientEvents {
  new_message: (payload: NewMessagePayload) => void;
  message_edited: (payload: MessageEditedPayload) => void;
  message_deleted: (payload: MessageDeletedPayload) => void;
  message_pinned: (payload: MessagePinnedPayload) => void;
  typing: (payload: TypingPayload) => void;
  online: (payload: OnlineStatusPayload) => void;
  error: (payload: { message: string; code?: string }) => void;
}

// --- Inter-server events (for multi-process scaling) ---

export interface InterServerEvents {
  ping: () => void;
}

// --- Socket data attached to each connection ---

export interface SocketData {
  userId: string;
  userName: string;
  email: string;
  roles: string[];
}
