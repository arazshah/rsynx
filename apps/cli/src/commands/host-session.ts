import { Terminal } from "@xterm/headless";
import { encryptMessage, type UserMessage } from "@rsynx/protocol";
import type { RelayClient, RelayClientEvents } from "../relay-client";
import { createTui } from "../tui";

const QUIT_BYTE = 0x1d; // Ctrl+] — classic telnet/rlogin escape convention, unlikely to collide with shell usage.

export async function runHostSession(params: {
  sessionId: string;
  key: CryptoKey;
  client: RelayClient;
  events: RelayClientEvents;
}): Promise<void> {
  const { sessionId, key, client, events } = params;

  const tui = createTui();
  const xterm = new Terminal({ cols: tui.cols, rows: tui.rows, allowProposedApi: true });
  let guestConnected = true;

  function updateStatus(): void {
    tui.setStatus(
      ` rsynx host  |  session ${sessionId}  |  guest: ${guestConnected ? "connected" : "gone"}  |  Ctrl+] quit `,
    );
  }
  updateStatus();
  tui.repaint(xterm);

  // Serializes async output handling so terminal-data chunks reach the guest in order.
  let chain: Promise<void> = Promise.resolve();

  function shutdown(): void {
    tui.destroy();
    client.close();
    process.exit(0);
  }

  const proc = Bun.spawn([process.env.SHELL ?? "bash"], {
    terminal: {
      cols: tui.cols,
      rows: tui.rows,
      data(_term, data) {
        chain = chain.then(() => handleHostOutput(data));
      },
      exit() {
        shutdown();
      },
    },
  });

  // `terminal` is always set here — this Bun.spawn call always passes the terminal option.
  const terminal = proc.terminal!;

  async function handleHostOutput(data: Uint8Array): Promise<void> {
    await new Promise<void>((resolve) => xterm.write(data, resolve));
    tui.repaint(xterm);

    if (guestConnected) {
      const message: UserMessage = {
        type: "terminal-data",
        payload: { chunk: Buffer.from(data).toString("base64") },
      };
      const envelope = await encryptMessage(key, message);
      client.sendUserEnvelope({
        level: "user",
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        ...envelope,
      });
    }
  }

  tui.onRawInput((chunk) => {
    if (chunk.length === 1 && chunk[0] === QUIT_BYTE) {
      terminal.close();
      shutdown();
      return;
    }
    terminal.write(chunk);
  });

  tui.onResize((cols, rows) => {
    xterm.resize(cols, rows);
    terminal.resize(cols, rows);
    tui.repaint(xterm);
  });

  events.onPeerLeft = () => {
    guestConnected = false;
    updateStatus();
  };
  events.onUserEnvelope = undefined;
  events.onSessionExpired = (reason) => {
    tui.setStatus(` Session expired: ${reason} `);
    tui.repaint(xterm);
  };
  events.onClose = () => shutdown();

  await proc.exited;
}
