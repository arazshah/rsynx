// Imported directly from their widget files (not the "neo-blessed" package
// root) so the build only needs the two widgets actually used. Going through
// the package root pulls in lib/widget.js, which eagerly `require()`s every
// widget — including terminal.js and image.js, whose optional native deps
// (term.js, pty.js) aren't installed and don't need to be.
import Screen from "neo-blessed/lib/widgets/screen.js";
import Box from "neo-blessed/lib/widgets/box.js";
import type { Widgets } from "neo-blessed";
import type { Terminal } from "@xterm/headless";
import { renderBuffer } from "./terminal-view";

export interface Tui {
  screen: Widgets.Screen;
  /** Usable size of the terminal viewport (screen size minus the 1-row status bar). */
  cols: number;
  rows: number;
  repaint(term: Terminal): void;
  setStatus(text: string): void;
  /** Raw bytes typed into the real terminal, before blessed's own key-name parsing. */
  onRawInput(handler: (chunk: Buffer) => void): void;
  onResize(handler: (cols: number, rows: number) => void): void;
  setChatContent(text: string): void;
  showChat(): void;
  hideChat(): void;
  destroy(): void;
}

/** neo-blessed is used only for screen layout — never for terminal emulation (docs/SPEC.md discussion). */
export function createTui(): Tui {
  // A prior readline.createInterface().close() (used for the host/join prompts)
  // can leave stdin paused; without an explicit resume() here, blessed's own
  // "data" listener never receives bytes even though it's attached correctly.
  process.stdin.resume();

  const screen = Screen({ smartCSR: true, title: "rsynx" });

  const terminalBox = Box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-1",
    tags: true,
    style: { fg: "default", bg: "default" },
  });

  const statusBar = Box({
    top: "100%-1",
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "black", bg: "white" },
  });

  const chatBox = Box({
    top: "60%-1",
    left: "50%",
    width: "50%",
    height: "40%",
    tags: true,
    hidden: true,
    border: { type: "line" },
    label: " chat (Ctrl+T) ",
    style: { fg: "default", bg: "default", border: { fg: "cyan" } },
  });

  screen.append(terminalBox);
  screen.append(statusBar);
  screen.append(chatBox);
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
    setChatContent(text) {
      chatBox.setContent(text);
      screen.render();
    },
    showChat() {
      chatBox.show();
      chatBox.setFront();
      screen.render();
    },
    hideChat() {
      chatBox.hide();
      screen.render();
    },
    destroy() {
      screen.destroy();
    },
  };
}
