import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "./server";

let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer(0); // let the OS pick a free port
});

afterAll(() => {
  server.stop(true);
});

describe("/health", () => {
  test("returns 200 OK", async () => {
    const res = await fetch(`http://localhost:${server.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});

describe("/ws", () => {
  test("rejects a missing or malformed session_id", async () => {
    const res = await fetch(`http://localhost:${server.port}/ws?session_id=abc&role=host`);
    expect(res.status).toBe(400);
  });

  test("rejects an invalid role", async () => {
    const res = await fetch(`http://localhost:${server.port}/ws?session_id=100000&role=nobody`);
    expect(res.status).toBe(400);
  });
});

function connect(sessionId: string, role: "host" | "guest"): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${server.port}/ws?session_id=${sessionId}&role=${role}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
  });
}

describe("session pairing", () => {
  test("both peers receive peer-joined once paired", async () => {
    const sessionId = "100001";
    const host = await connect(sessionId, "host");
    const hostPeerJoined = nextMessage(host);
    const guest = await connect(sessionId, "guest");
    const guestPeerJoined = nextMessage(guest);

    const [hostMsg, guestMsg] = await Promise.all([hostPeerJoined, guestPeerJoined]);
    expect(hostMsg).toMatchObject({ level: "relay", type: "peer-joined", data: { role: "guest" } });
    expect(guestMsg).toMatchObject({ level: "relay", type: "peer-joined", data: { role: "host" } });

    host.close();
    guest.close();
  });

  test("forwards a user-level envelope opaquely to the other peer", async () => {
    const sessionId = "100002";
    const host = await connect(sessionId, "host");
    const hostPeerJoined = nextMessage(host);
    const guest = await connect(sessionId, "guest");
    await nextMessage(guest); // drain guest's own peer-joined
    await hostPeerJoined; // drain host's peer-joined

    const envelope = {
      level: "user",
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      nonce: "AAAA",
      ciphertext: "BBBB",
    };
    const guestReceipt = nextMessage(guest);
    host.send(JSON.stringify(envelope));
    const received = await guestReceipt;
    expect(received).toEqual(envelope);

    host.close();
    guest.close();
  });

  test("answers heartbeat with heartbeat-ack", async () => {
    const sessionId = "100003";
    const host = await connect(sessionId, "host");
    const ack = nextMessage(host);
    host.send(JSON.stringify({ level: "relay", type: "heartbeat", session_id: sessionId, timestamp: new Date().toISOString(), data: {} }));
    const message = await ack;
    expect(message).toMatchObject({ level: "relay", type: "heartbeat-ack" });

    host.close();
  });

  test("notifies the remaining peer with peer-left on disconnect", async () => {
    const sessionId = "100004";
    const host = await connect(sessionId, "host");
    const hostPeerJoined = nextMessage(host);
    const guest = await connect(sessionId, "guest");
    await nextMessage(guest);
    await hostPeerJoined;

    const peerLeft = nextMessage(host);
    guest.close();
    const message = await peerLeft;
    expect(message).toMatchObject({ level: "relay", type: "peer-left", data: { role: "guest" } });

    host.close();
  });
});
