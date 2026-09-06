import { describe, expect, test } from "bun:test";
import { ChatController } from "./chat";

const ENTER = Buffer.from([0x0d]);
const BACKSPACE = Buffer.from([0x7f]);
const ESCAPE = Buffer.from([0x1b]);
const CTRL_T = Buffer.from([0x14]);
const CTRL_BRACKET = Buffer.from([0x1d]);
const ARROW_UP = Buffer.from([0x1b, 0x5b, 0x41]);
const ARROW_DOWN = Buffer.from([0x1b, 0x5b, 0x42]);

function text(buf: Buffer): string {
  return buf.toString("utf8");
}

describe("ChatController — passthrough when closed", () => {
  test("Enter passes through untouched (submitting a shell command)", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(ENTER, () => {});
    expect(result.passthrough).toEqual(ENTER);
    expect(result.quit).toBe(false);
  });

  test("Backspace passes through untouched (deleting a shell character)", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(BACKSPACE, () => {});
    expect(result.passthrough).toEqual(BACKSPACE);
  });

  test("Escape passes through untouched (e.g. cancelling a shell prompt)", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(ESCAPE, () => {});
    expect(result.passthrough).toEqual(ESCAPE);
  });

  test("an arrow key (CSI sequence) passes through byte-for-byte", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(ARROW_UP, () => {});
    expect(result.passthrough).toEqual(ARROW_UP);
  });

  test("regular typed text passes through untouched", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(Buffer.from("echo hi"), () => {});
    expect(text(result.passthrough)).toBe("echo hi");
  });
});

describe("ChatController — Ctrl+] quits regardless of state", () => {
  test("closed", () => {
    const chat = new ChatController();
    expect(chat.handleChunk(CTRL_BRACKET, () => {}).quit).toBe(true);
  });

  test("open", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    expect(chat.handleChunk(CTRL_BRACKET, () => {}).quit).toBe(true);
  });
});

describe("ChatController — compose overlay", () => {
  test("Ctrl+T opens the overlay and consumes the byte (no passthrough)", () => {
    const chat = new ChatController();
    const result = chat.handleChunk(CTRL_T, () => {});
    expect(chat.isOpen()).toBe(true);
    expect(result.passthrough.length).toBe(0);
  });

  test("typed text while open is composed, not passed through", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    const result = chat.handleChunk(Buffer.from("hello"), () => {});
    expect(result.passthrough.length).toBe(0);
    expect(chat.renderContent()).toContain("hello");
  });

  test("Enter while open sends the composed message and clears it", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    chat.handleChunk(Buffer.from("hi there"), () => {});
    let sent: string | undefined;
    const result = chat.handleChunk(ENTER, (t) => (sent = t));
    expect(sent).toBe("hi there");
    expect(result.passthrough.length).toBe(0);
    expect(chat.renderContent()).toContain("you:");
    expect(chat.renderContent()).toContain("hi there");
  });

  test("Backspace while open edits the compose buffer", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    chat.handleChunk(Buffer.from("hello"), () => {});
    chat.handleChunk(BACKSPACE, () => {});
    expect(chat.renderContent()).toContain("hell_");
  });

  test("a lone Escape while open closes the overlay and discards the draft", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    chat.handleChunk(Buffer.from("draft"), () => {});
    const result = chat.handleChunk(ESCAPE, () => {});
    expect(chat.isOpen()).toBe(false);
    expect(result.passthrough.length).toBe(0);
  });

  test("Ctrl+T again closes the overlay and returns typed bytes to passthrough afterward", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    chat.handleChunk(CTRL_T, () => {});
    expect(chat.isOpen()).toBe(false);
    const result = chat.handleChunk(Buffer.from("ls"), () => {});
    expect(text(result.passthrough)).toBe("ls");
  });
});

describe("ChatController — arrow keys while open scroll instead of leaking", () => {
  test("an arrow key while open is consumed, not passed through, and doesn't close the overlay", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    const result = chat.handleChunk(ARROW_UP, () => {});
    expect(result.passthrough.length).toBe(0);
    expect(chat.isOpen()).toBe(true);
  });

  test("scrolling up then all the way back down returns to the latest messages", () => {
    const chat = new ChatController();
    chat.handleChunk(CTRL_T, () => {});
    for (let i = 0; i < 10; i++) {
      chat.handleChunk(Buffer.from(`msg${i}`), () => {});
      chat.handleChunk(ENTER, () => {});
    }
    // With a tiny viewport, only the newest message should show by default.
    expect(chat.renderContent(3)).toContain("msg9");
    expect(chat.renderContent(3)).not.toContain("msg8");

    chat.handleChunk(ARROW_UP, () => {});
    expect(chat.renderContent(3)).not.toContain("msg9");
    expect(chat.renderContent(3)).toContain("msg8");

    chat.handleChunk(ARROW_DOWN, () => {});
    expect(chat.renderContent(3)).toContain("msg9");
  });
});

describe("ChatController — renderContent sizes to the available viewport", () => {
  test("shows the newest messages first when the box is small, not the oldest", () => {
    const chat = new ChatController();
    for (let i = 0; i < 20; i++) chat.receiveMessage(`m${i}`);
    const rendered = chat.renderContent(4); // 2 message rows fit (4 - 2 reserved)
    expect(rendered).toContain("m19");
    expect(rendered).toContain("m18");
    expect(rendered).not.toContain("m17");
    expect(rendered).not.toContain("m0");
  });

  test("a newly received message snaps the view back to the latest", () => {
    const chat = new ChatController();
    for (let i = 0; i < 10; i++) chat.receiveMessage(`m${i}`);
    chat.handleChunk(CTRL_T, () => {});
    chat.handleChunk(ARROW_UP, () => {});
    chat.handleChunk(ARROW_UP, () => {});
    expect(chat.renderContent(3)).not.toContain("m9");

    chat.receiveMessage("fresh");
    expect(chat.renderContent(3)).toContain("fresh");
  });
});
