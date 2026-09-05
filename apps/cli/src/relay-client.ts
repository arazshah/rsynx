import type { PeerRole, RelayMessageType } from "@rsynx/protocol";

const DEFAULT_RELAY_URL = "ws://localhost:8080";
const HEARTBEAT_INTERVAL_MS = 15_000;

export interface RelayClientEvents {
  onPeerJoined?: (role: PeerRole) => void;
  onPeerLeft?: (role: PeerRole) => void;
  onSessionExpired?: (reason: "idle" | "join-timeout" | "heartbeat-timeout") => void;
  onUserEnvelope?: (envelope: Record<string, unknown>) => void;
  onClose?: () => void;
}

/** Thin transport wrapper around the relay WebSocket connection (docs/SPEC.md §2, §5). */
export class RelayClient {
  private ws: WebSocket;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly sessionId: string,
    role: PeerRole,
    private readonly events: RelayClientEvents = {},
  ) {
    const relayUrl = process.env.RSYNX_RELAY_URL ?? DEFAULT_RELAY_URL;
    this.ws = new WebSocket(`${relayUrl}/ws?session_id=${sessionId}&role=${role}`);
    this.ws.onopen = () => this.startHeartbeat();
    this.ws.onmessage = (event) => this.handleMessage(String(event.data));
    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.events.onClose?.();
    };
  }

  waitUntilOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", (event) => reject(event), { once: true });
    });
  }

  sendUserEnvelope(envelope: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(envelope));
  }

  close(): void {
    this.stopHeartbeat();
    this.ws.close();
  }

  private startHeartbeat(): void {
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private sendHeartbeat(): void {
    this.ws.send(
      JSON.stringify({
        level: "relay",
        type: "heartbeat",
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
        data: {},
      }),
    );
  }

  private handleMessage(raw: string): void {
    let parsed: { level?: string; type?: string; data?: { role?: PeerRole; reason?: string } };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.level === "relay") {
      const type = parsed.type as RelayMessageType | undefined;
      if (type === "peer-joined" && parsed.data?.role) {
        this.events.onPeerJoined?.(parsed.data.role);
      } else if (type === "peer-left" && parsed.data?.role) {
        this.events.onPeerLeft?.(parsed.data.role);
      } else if (type === "session-expired" && parsed.data?.reason) {
        this.events.onSessionExpired?.(parsed.data.reason as "idle" | "join-timeout" | "heartbeat-timeout");
      }
      return;
    }

    if (parsed.level === "user") {
      this.events.onUserEnvelope?.(parsed as Record<string, unknown>);
    }
  }
}
