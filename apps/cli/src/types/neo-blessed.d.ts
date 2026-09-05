// neo-blessed is an API-compatible fork of blessed with no published type
// definitions of its own; @types/blessed's shapes apply directly.
declare module "neo-blessed" {
  export * from "blessed";
}

// tui.ts imports these widget files directly (not the package root) to keep
// `bun build --compile` from pulling in every neo-blessed widget — see the
// comment in tui.ts for why.
declare module "neo-blessed/lib/widgets/screen.js" {
  import type { Widgets } from "neo-blessed";
  const Screen: (options?: Widgets.IScreenOptions) => Widgets.Screen;
  export default Screen;
}

declare module "neo-blessed/lib/widgets/box.js" {
  import type { Widgets } from "neo-blessed";
  const Box: (options?: Widgets.BoxOptions) => Widgets.BoxElement;
  export default Box;
}
