import * as blessed from "neo-blessed";
import type { Terminal } from "@xterm/headless";
import { renderBuffer } from "./terminal-view";

export interface Tui {
  screen: blessed.Widgets.Screen;
  /** Usable size of the terminal viewport (screen size minus the 1-row status bar). */
  cols: number;
  rows: number;
  repaint(term: Terminal): void;
  setStatus(text: string): void;
  /** Raw bytes typed into the real terminal, before blessed's own key-name parsing. */
  onRawInput(handler: (chunk: Buffer) => void): void;
  onResize(handler: (cols: number, rows: number) => void): void;
  destroy(): void;
}

/** neo-blessed is used only for screen layout — never for terminal emulation (docs/SPEC.md discussion). */
export function createTui(): Tui {
  const screen = blessed.screen({ smartCSR: true, title: "rsynx" });

  const terminalBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-1",
    tags: true,
    style: { fg: "default", bg: "default" },
  });

  const statusBar = blessed.box({
    top: "100%-1",
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "black", bg: "white" },
  });

  screen.append(terminalBox);
  screen.append(statusBar);
  screen.render();

  return {
    screen,
    get cols() {
      return screen.cols;
    },
    get rows() {
      return screen.rows - 1;
    },
    repaint(term) {
      terminalBox.setContent(renderBuffer(term));
      screen.render();
    },
    setStatus(text) {
      statusBar.setContent(text);
      screen.render();
    },
    onRawInput(handler) {
      // program.input carries raw bytes before blessed's keypress parser
      // decodes them into named keys — needed so escape sequences (arrow
      // keys, etc.) reach the child pty byte-for-byte.
      screen.program.input.on("data", handler);
    },
    onResize(handler) {
      screen.on("resize", () => handler(screen.cols, screen.rows - 1));
    },
    destroy() {
      screen.destroy();
    },
  };
}
