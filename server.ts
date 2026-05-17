/**
 * Custom server entry point — wraps Next.js with Socket.io.
 *
 * Usage:
 *   Development: npx tsx server.ts
 *   Production:  node --import tsx server.ts  (or compile with tsc first)
 *
 * This creates an HTTP server, attaches Socket.io, then passes
 * remaining HTTP requests to Next.js request handler.
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { initSocketServer } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url || "", true);
    handle(req, res, parsedUrl);
  });

  // Attach Socket.io to the HTTP server
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (${dev ? "development" : "production"})`
    );
    console.log(`> Socket.io attached at /api/socketio`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
