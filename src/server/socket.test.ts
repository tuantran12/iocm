import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { initSocketServer, getSocketServer, getOnlineUsers, isUserOnline } from "./socket";

// Mock the db module to avoid real database calls
vi.mock("@/lib/db", () => ({
  db: {
    groupMembership: {
      findFirst: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
    },
  },
}));

const TEST_PORT = 9876;
let httpServer: HttpServer;
let serverSocket: SocketIOServer;

function createAuthClient(auth: { userId: string; userName: string; email?: string; roles?: string[] }): ClientSocket {
  return ioClient(`http://localhost:${TEST_PORT}`, {
    path: "/api/socketio",
    auth,
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitForConnect(client: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 3000);
    client.on("connect", () => { clearTimeout(timeout); resolve(); });
    client.on("connect_error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

describe("Socket.io Server", () => {
  beforeAll(async () => {
    httpServer = createServer();
    serverSocket = initSocketServer(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterAll(async () => {
    serverSocket.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("should reject connection without authentication", async () => {
    const unauthClient = ioClient(`http://localhost:${TEST_PORT}`, {
      path: "/api/socketio",
      auth: {},
      transports: ["websocket"],
      forceNew: true,
    });

    const error = await new Promise<Error>((resolve) => {
      unauthClient.on("connect_error", (err) => resolve(err));
    });

    expect(error.message).toContain("Authentication required");
    unauthClient.disconnect();
  });

  it("should accept connection with valid auth data", async () => {
    const client = createAuthClient({
      userId: "user-1",
      userName: "Test User",
      email: "test@example.com",
      roles: ["MEMBER"],
    });

    await waitForConnect(client);
    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it("should track user as online after connection", async () => {
    const client = createAuthClient({
      userId: "user-online-1",
      userName: "Online User",
    });

    await waitForConnect(client);
    await new Promise((r) => setTimeout(r, 50));

    expect(isUserOnline("user-online-1")).toBe(true);
    expect(getOnlineUsers()).toContain("user-online-1");
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("should allow joining and leaving group rooms", async () => {
    const client = createAuthClient({
      userId: "user-room-1",
      userName: "Room User",
    });

    await waitForConnect(client);

    // Join and leave should not throw
    client.emit("join_group", "group-abc");
    client.emit("leave_group", "group-abc");
    await new Promise((r) => setTimeout(r, 50));

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it("should broadcast typing indicator to other clients in the same room", async () => {
    const client1 = createAuthClient({
      userId: "user-type-1",
      userName: "Typer",
    });
    const client2 = createAuthClient({
      userId: "user-type-2",
      userName: "Watcher",
    });

    await Promise.all([waitForConnect(client1), waitForConnect(client2)]);

    // Both join the same group
    client1.emit("join_group", "group-typing");
    client2.emit("join_group", "group-typing");
    await new Promise((r) => setTimeout(r, 50));

    // Client 2 listens for typing
    const typingPromise = new Promise<{ userId: string; isTyping: boolean }>((resolve) => {
      client2.on("typing", (payload) => resolve(payload));
    });

    // Client 1 sends typing
    client1.emit("typing", { groupId: "group-typing", isTyping: true });

    const typingPayload = await typingPromise;
    expect(typingPayload.userId).toBe("user-type-1");
    expect(typingPayload.isTyping).toBe(true);

    client1.disconnect();
    client2.disconnect();
  });

  it("should track user offline after disconnect", async () => {
    const client = createAuthClient({
      userId: "user-offline-test",
      userName: "Offline User",
    });

    await waitForConnect(client);
    await new Promise((r) => setTimeout(r, 50));
    expect(isUserOnline("user-offline-test")).toBe(true);

    client.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    expect(isUserOnline("user-offline-test")).toBe(false);
  });

  it("should broadcast online status to other connected clients", async () => {
    const client1 = createAuthClient({
      userId: "user-presence-1",
      userName: "Existing User",
    });

    await waitForConnect(client1);
    await new Promise((r) => setTimeout(r, 50));

    // Client 1 listens for online event
    const onlinePromise = new Promise<{ userId: string; userName: string; online: boolean }>((resolve) => {
      client1.on("online", (payload) => {
        if (payload.userId === "user-presence-2") resolve(payload);
      });
    });

    // Client 2 connects — should trigger online broadcast
    const client2 = createAuthClient({
      userId: "user-presence-2",
      userName: "New User",
    });
    await waitForConnect(client2);

    const onlinePayload = await onlinePromise;
    expect(onlinePayload.userId).toBe("user-presence-2");
    expect(onlinePayload.userName).toBe("New User");
    expect(onlinePayload.online).toBe(true);

    // Now listen for offline broadcast when client2 disconnects
    const offlinePromise = new Promise<{ userId: string; online: boolean }>((resolve) => {
      client1.on("online", (payload) => {
        if (payload.userId === "user-presence-2" && !payload.online) resolve(payload);
      });
    });

    client2.disconnect();
    const offlinePayload = await offlinePromise;
    expect(offlinePayload.userId).toBe("user-presence-2");
    expect(offlinePayload.online).toBe(false);

    client1.disconnect();
  });

  it("getSocketServer should return the server instance after init", () => {
    const server = getSocketServer();
    expect(server).not.toBeNull();
    expect(server).toBeInstanceOf(SocketIOServer);
  });
});
