const QUIT_BYTE = 0x1d; // Ctrl+] — classic telnet/rlogin escape convention, unlikely to collide with shell usage.
const CHAT_TOGGLE_BYTE = 0x14; // Ctrl+T
const ESCAPE_BYTE = 0x1b;
const CSI_BYTE = 0x5b; // '[' — second byte of a CSI escape sequence (arrow keys, page up/down, ...).
const CSI_UP = 0x41; // 'A'
const CSI_DOWN = 0x42; // 'B'
const ENTER_BYTES = new Set([0x0d, 0x0a]);
const BACKSPACE_BYTES = new Set([0x7f, 0x08]);
const DEFAULT_VISIBLE_LINES = 8;

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
 * Recognizes a CSI escape sequence (ESC '[' ... final-byte) starting at
 * `start`, per ECMA-48: parameter bytes 0x30-0x3F, intermediate bytes
 * 0x20-0x2F, then one final byte 0x40-0x7E. Returns null if `start` isn't a
 * CSI sequence or the sequence isn't complete within this chunk (arrow keys
 * etc. are always delivered as one atomic write by a real terminal, so
 * cross-chunk splits aren't handled).
 */
function matchCsiSequence(chunk: Buffer, start: number): { end: number; final: number } | null {
  if (chunk[start] !== ESCAPE_BYTE || chunk[start + 1] !== CSI_BYTE) return null;
  let i = start + 2;
  while (i < chunk.length && chunk[i]! >= 0x30 && chunk[i]! <= 0x3f) i++;
  while (i < chunk.length && chunk[i]! >= 0x20 && chunk[i]! <= 0x2f) i++;
  if (i >= chunk.length) return null;
  const final = chunk[i]!;
  if (final < 0x40 || final > 0x7e) return null;
  return { end: i + 1, final };
}

/**
 * Routes raw terminal input for a session: the quit hotkey, the chat-overlay
 * toggle, and (while the overlay is open) line-editing plus history
 * scrolling for the compose buffer. Scans byte-by-byte rather than assuming
 * one input chunk = one keystroke — a real pty commonly coalesces several
 * keystrokes (or an entire pasted/typed burst) into a single "data" event,
 * which would otherwise cause control bytes bundled with other bytes to
 * slip through unrecognized. Runs of non-control bytes are decoded as UTF-8
 * (not byte-by-byte) so multi-byte compose text is not corrupted.
 *
 * Escape, Enter, and Backspace are only special while the chat overlay is
 * open (compose-line editing) -- when it's closed they must reach the
 * passthrough output like any other byte, since they're ordinary terminal
 * control characters (submitting a shell command, deleting a character,
 * cancelling a prompt).
 */
export class ChatController {
  private open = false;
  private compose = "";
  private history: ChatEntry[] = [];
  /** Messages scrolled back from the latest; 0 means following the newest messages. */
  private scrollOffset = 0;

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

    let i = 0;
    while (i < chunk.length) {
      const byte = chunk[i]!;

      if (byte === QUIT_BYTE) {
        flushRun(i);
        quit = true;
        i++;
        continue;
      }

      if (byte === CHAT_TOGGLE_BYTE) {
        flushRun(i);
        this.open = !this.open;
        if (this.open) this.scrollOffset = 0;
        else this.compose = "";
        i++;
        continue;
      }

      if (this.open && byte === ESCAPE_BYTE) {
        const csi = matchCsiSequence(chunk, i);
        if (csi) {
          // Scroll the compose overlay's history instead of leaking the
          // sequence to the terminal or treating it as "close chat".
          flushRun(i);
          if (csi.final === CSI_UP) {
            this.scrollOffset += 1;
          } else if (csi.final === CSI_DOWN) {
            this.scrollOffset = Math.max(0, this.scrollOffset - 1);
          }
          i = csi.end;
          continue;
        }
        flushRun(i);
        this.open = false;
        this.compose = "";
        i++;
        continue;
      }

      if (this.open && BACKSPACE_BYTES.has(byte)) {
        flushRun(i);
        this.compose = this.compose.slice(0, -1);
        i++;
        continue;
      }

      if (this.open && ENTER_BYTES.has(byte)) {
        flushRun(i);
        const text = this.compose.trim();
        this.compose = "";
        this.scrollOffset = 0;
        if (text.length > 0) {
          this.history.push({ from: "me", text });
          onSend(text);
        }
        i++;
        continue;
      }

      if (runStart === -1) runStart = i;
      i++;
    }
    flushRun(chunk.length);

    return { passthrough: Buffer.concat(passthroughParts), quit };
  }

  receiveMessage(text: string): void {
    this.history.push({ from: "peer", text });
    this.scrollOffset = 0; // a new message always snaps the view back to "latest"
  }

  /**
   * @param visibleLines Rows actually available in the chat box (from the
   * TUI, based on its current rendered height). Sizing to this rather than
   * a fixed count is what keeps the newest messages on screen when the
   * terminal is small, instead of the box clipping them from the bottom.
   */
  renderContent(visibleLines: number = DEFAULT_VISIBLE_LINES): string {
    const messageLines = Math.max(1, visibleLines - 2); // reserve the blank separator + compose row
    const total = this.history.length;
    const maxOffset = Math.max(0, total - messageLines);
    if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;

    const end = total - this.scrollOffset;
    const start = Math.max(0, end - messageLines);
    const lines = this.history
      .slice(start, end)
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
