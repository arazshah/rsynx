import { sessionRegistry, type WSData } from "./session-registry";

const SESSION_ID_PATTERN = /^\d{6}$/;

/**
 * Connection contract: clients open a WebSocket at
 * `/ws?session_id=<6 digits>&role=host|guest`. Everything after that is
 * envelope messages per docs/SPEC.md §5.
 */
export function createServer(port: number) {
  return Bun.serve<WSData>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return new Response("OK", { status: 200 });
      }

      if (url.pathname === "/ws") {
        const sessionId = url.searchParams.get("session_id");
        const role = url.searchParams.get("role");

        if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
          return new Response("invalid or missing session_id", { status: 400 });
        }
        if (role !== "host" && role !== "guest") {
          return new Response("role must be 'host' or 'guest'", { status: 400 });
        }

        const upgraded = server.upgrade(req, { data: { sessionId, role } });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return;
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        sessionRegistry.connect(ws);
      },
      message(ws, message) {
        sessionRegistry.handleMessage(ws, message);
      },
      close(ws) {
        sessionRegistry.disconnect(ws);
      },
    },
  });
}
