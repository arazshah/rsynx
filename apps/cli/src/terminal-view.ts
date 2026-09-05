import type { Terminal } from "@xterm/headless";

/**
 * xterm.js internal color-mode constants (Attributes.CM_PALETTE / CM_RGB).
 * Confirmed empirically against @xterm/headless output during the TUI-library
 * spike (a basic SGR color cell reported mode 16777216 with a palette index).
 */
const COLOR_MODE_PALETTE = 16777216;
const COLOR_MODE_RGB = 33554432;

/** blessed supports both `{N-fg}` (0-255 palette index) and `{#rrggbb-fg}` tags natively. */
function colorTag(mode: number, value: number, kind: "fg" | "bg"): string | null {
  if (mode === COLOR_MODE_PALETTE) return `${value}-${kind}`;
  if (mode === COLOR_MODE_RGB) return `#${value.toString(16).padStart(6, "0")}-${kind}`;
  return null;
}

function escapeBraces(text: string): string {
  return text.replace(/{/g, "{open-brace}").replace(/}/g, "{close-brace}");
}

/** Renders the current xterm-headless active buffer as blessed tag-markup content. */
export function renderBuffer(term: Terminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];

  for (let y = 0; y < term.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y);
    if (!line) {
      lines.push("");
      continue;
    }

    let out = "";
    let openTags: string[] | null = null;

    for (let x = 0; x < term.cols; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue; // wide-char continuation cell

      const isCursor = y === buffer.cursorY && x === buffer.cursorX;
      const tags: string[] = [];
      const fgTag = colorTag(cell.getFgColorMode(), cell.getFgColor(), "fg");
      const bgTag = colorTag(cell.getBgColorMode(), cell.getBgColor(), "bg");
      if (fgTag) tags.push(fgTag);
      if (bgTag) tags.push(bgTag);
      if (cell.isBold()) tags.push("bold");
      if (cell.isUnderline()) tags.push("underline");
      if (cell.isBlink()) tags.push("blink");
      if (cell.isInvisible()) tags.push("invisible");
      if (Boolean(cell.isInverse()) !== isCursor) tags.push("inverse");

      const key = tags.join(",");
      if (key !== (openTags?.join(",") ?? "")) {
        if (openTags) out += "{/}";
        if (tags.length > 0) out += `{${key}}`;
        openTags = tags.length > 0 ? tags : null;
      }

      out += escapeBraces(cell.getChars() || " ");
    }

    if (openTags) out += "{/}";
    lines.push(out);
  }

  return lines.join("\n");
}
