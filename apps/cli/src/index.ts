#!/usr/bin/env bun
import { runHost } from "./commands/host";
import { runJoin } from "./commands/join";

const command = process.argv[2];

try {
  switch (command) {
    case "host": {
      await runHost();
      break;
    }
    case "join": {
      await runJoin(process.argv[3]);
      break;
    }
    default: {
      console.error(`Unknown command: ${command ?? "(none)"}\nUsage: rsynx host | rsynx join <session-id>`);
      process.exit(1);
    }
  }
} catch {
  // host.ts/join.ts already printed a user-facing error message.
  process.exit(1);
}
