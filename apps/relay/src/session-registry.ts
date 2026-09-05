import type { ServerWebSocket } from "bun";
import type { PeerRole, RelayMessage, RelayMessageType } from "@rsynx/protocol";
import { logEvent } from "./logger";

export interface WSData {
  sessionId: string;
  role: PeerRole;
}

type Socket = ServerWebSocket<WSData>;

// Exact values per docs/SPEC.md §8.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const JOIN_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 45 * 1000;

interface Peer {
  socket: Socket;
  heartbeatTimer: ReturnType<typeof setTimeout>;
}

interface Session {
  sessionId: string;
  host?: Peer;
  guest?: Peer;
  idleTimer: ReturnType<typeof setTimeout>;
  joinWaitTimer?: ReturnType<typeof setTimeout>;
}

function otherRoleOf(role: PeerRole): PeerRole {
  return role === "host" ? "guest" : "host";
}

/** Builds a relay-level envelope (docs/SPEC.md §5.1). Callers own matching `type` to `data`. */
function relayEnvelope(sessionId: string, type: RelayMessageType, data: Record<string, unknown>): RelayMessage {
  return {
    level: "relay",
    type,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    data,
  } as RelayMessage;
}

function send(peer: Peer | undefined, message: unknown): void {
  peer?.socket.send(JSON.stringify(message));
}

/**
 * Holds all in-memory session state (docs/SPEC.md §1.3 — relay never persists
 * anything to disk). One process-wide instance; sessions are keyed by session-id.
 */
class SessionRegistry {
  private sessions = new Map<string, Session>();

  connect(socket: Socket): void {
    const { sessionId, role } = socket.data;
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        idleTimer: this.scheduleIdleTimeout(sessionId),
        joinWaitTimer: this.scheduleJoinWaitTimeout(sessionId),
      };
      this.sessions.set(sessionId, session);
    }

    if (session[role]) {
      logEvent(sessionId, `duplicate ${role} connection rejected`);
      socket.close(4001, "role already connected");
      return;
    }

    const peer: Peer = { socket, heartbeatTimer: this.scheduleHeartbeatTimeout(sessionId, role) };
    session[role] = peer;
    logEvent(sessionId, `${role} connected`);

    const otherRole = otherRoleOf(role);
    const other = session[otherRole];
    if (other) {
      if (session.joinWaitTimer) {
        clearTimeout(session.joinWaitTimer);
        session.joinWaitTimer = undefined;
      }
      send(other, relayEnvelope(sessionId, "peer-joined", { role }));
      send(peer, relayEnvelope(sessionId, "peer-joined", { role: otherRole }));
      logEvent(sessionId, "peer-joined dispatched to both peers");
    }
  }

  handleMessage(socket: Socket, raw: string | Buffer): void {
    const { sessionId, role } = socket.data;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    let parsed: { level?: string; type?: string };
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      logEvent(sessionId, `malformed message from ${role} ignored`);
      return;
    }

    if (parsed.level === "relay" && parsed.type === "heartbeat") {
      this.resetHeartbeatTimeout(session, role);
      send(session[role], relayEnvelope(sessionId, "heartbeat-ack", {}));
      return;
    }

    if (parsed.level === "user") {
      // Relay never inspects or logs user-level payload content (docs/SPEC.md §9).
      this.resetIdleTimeout(session);
      const other = session[otherRoleOf(role)];
      if (other) {
        send(other, parsed);
        logEvent(sessionId, "user-level message forwarded (payload not inspected)");
      }
      return;
    }

    logEvent(sessionId, `unrecognized message from ${role} ignored`);
  }

  disconnect(socket: Socket): void {
    const { sessionId, role } = socket.data;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const peer = session[role];
    if (peer) clearTimeout(peer.heartbeatTimer);
    session[role] = undefined;
    logEvent(sessionId, `${role} disconnected`);

    const other = session[otherRoleOf(role)];
    if (other) {
      send(other, relayEnvelope(sessionId, "peer-left", { role }));
    }

    if (!session.host && !session.guest) {
      this.destroySession(session);
    }
  }

  private scheduleIdleTimeout(sessionId: string) {
    return setTimeout(() => this.expireSession(sessionId, "idle"), IDLE_TIMEOUT_MS);
  }

  private scheduleJoinWaitTimeout(sessionId: string) {
    return setTimeout(() => this.expireSession(sessionId, "join-timeout"), JOIN_WAIT_TIMEOUT_MS);
  }

  private scheduleHeartbeatTimeout(sessionId: string, role: PeerRole) {
    return setTimeout(() => this.handleHeartbeatTimeout(sessionId, role), HEARTBEAT_TIMEOUT_MS);
  }

  private resetHeartbeatTimeout(session: Session, role: PeerRole): void {
    const peer = session[role];
    if (!peer) return;
    clearTimeout(peer.heartbeatTimer);
    peer.heartbeatTimer = this.scheduleHeartbeatTimeout(session.sessionId, role);
  }

  private resetIdleTimeout(session: Session): void {
    clearTimeout(session.idleTimer);
    session.idleTimer = this.scheduleIdleTimeout(session.sessionId);
  }

  private handleHeartbeatTimeout(sessionId: string, role: PeerRole): void {
    const session = this.sessions.get(sessionId);
    const peer = session?.[role];
    if (!session || !peer) return;
    logEvent(sessionId, `heartbeat timeout for ${role}`);
    peer.socket.close(4002, "heartbeat timeout");
  }

  private expireSession(sessionId: string, reason: "idle" | "join-timeout"): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    logEvent(sessionId, `session expired: ${reason}`);
    const message = relayEnvelope(sessionId, "session-expired", { reason });
    for (const role of ["host", "guest"] as const) {
      const peer = session[role];
      if (peer) {
        send(peer, message);
        peer.socket.close(4003, reason);
      }
    }
    this.destroySession(session);
  }

  private destroySession(session: Session): void {
    clearTimeout(session.idleTimer);
    if (session.joinWaitTimer) clearTimeout(session.joinWaitTimer);
    if (session.host) clearTimeout(session.host.heartbeatTimer);
    if (session.guest) clearTimeout(session.guest.heartbeatTimer);
    this.sessions.delete(session.sessionId);
    logEvent(session.sessionId, "session destroyed");
  }
}

export const sessionRegistry = new SessionRegistry();
