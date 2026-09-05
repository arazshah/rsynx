const QUIT_BYTE = 0x1d; // Ctrl+] — classic telnet/rlogin escape convention, unlikely to collide with shell usage.
const CHAT_TOGGLE_BYTE = 0x14; // Ctrl+T
const ESCAPE_BYTE = 0x1b;
const ENTER_BYTES = new Set([0x0d, 0x0a]);
const BACKSPACE_BYTES = new Set([0x7f, 0x08]);
const HISTORY_LIMIT = 8;

interface ChatEntry {
  from: "me" | "peer";
  text: string;
}

export interface ChunkResult {
  /** Bytes not consumed by any control sequence — forward these to the pty (host) or ignore (guest). */
  passthrough: Buffer;
  /** True if the quit hotkey (Ctrl+]) appeared anywhere in this chunk. */
  quit: boolean;
}

function escapeBraces(text: string): string {
  return text.replace(/{/g, "{open-brace}").replace(/}/g, "{close-brace}");
}

/**
 * Routes raw terminal input for a session: the quit hotkey, the chat-overlay
 * toggle, and (while the overlay is open) line-editing for the compose
 * buffer. Scans byte-by-byte rather than assuming one input chunk = one
 * keystroke — a real pty commonly coalesces several keystrokes (or an
 * entire pasted/typed burst) into a single "data" event, which would
 * otherwise cause control bytes bundled with other bytes to slip through
 * unrecognized. Runs of non-control bytes are decoded as UTF-8 (not
 * byte-by-byte) so multi-byte compose text is not corrupted.
 */
export class ChatController {
  private open = false;
  private compose = "";
  private history: ChatEntry[] = [];

  isOpen(): boolean {
    return this.open;
  }

  handleChunk(chunk: Buffer, onSend: (text: string) => void): ChunkResult {
    const passthroughParts: Buffer[] = [];
    let quit = false;
    let runStart = -1;

    const flushRun = (end: number) => {
      if (runStart === -1) return;
      const slice = chunk.subarray(runStart, end);
      if (this.open) this.compose += slice.toString("utf8");
      else passthroughParts.push(Buffer.from(slice));
      runStart = -1;
    };

    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;
      const isControl =
        byte === QUIT_BYTE ||
        byte === CHAT_TOGGLE_BYTE ||
        byte === ESCAPE_BYTE ||
        BACKSPACE_BYTES.has(byte) ||
        ENTER_BYTES.has(byte);

      if (!isControl) {
        if (runStart === -1) runStart = i;
        continue;
      }
      flushRun(i);

      if (byte === QUIT_BYTE) {
        quit = true;
        continue;
      }

      if (!this.open) {
        if (byte === CHAT_TOGGLE_BYTE) this.open = true;
        continue;
      }

      if (byte === CHAT_TOGGLE_BYTE || byte === ESCAPE_BYTE) {
        this.open = false;
        this.compose = "";
      } else if (BACKSPACE_BYTES.has(byte)) {
        this.compose = this.compose.slice(0, -1);
      } else if (ENTER_BYTES.has(byte)) {
        const text = this.compose.trim();
        this.compose = "";
        if (text.length > 0) {
          this.history.push({ from: "me", text });
          onSend(text);
        }
      }
    }
    flushRun(chunk.length);

    return { passthrough: Buffer.concat(passthroughParts), quit };
  }

  receiveMessage(text: string): void {
    this.history.push({ from: "peer", text });
  }

  renderContent(): string {
    const lines = this.history
      .slice(-HISTORY_LIMIT)
      .map((entry) =>
        entry.from === "me"
          ? `{green-fg}you:{/green-fg} ${escapeBraces(entry.text)}`
          : `{cyan-fg}peer:{/cyan-fg} ${escapeBraces(entry.text)}`,
      );
    lines.push("");
    lines.push(`{bold}>{/bold} ${escapeBraces(this.compose)}_`);
    return lines.join("\n");
  }
}
