#!/usr/bin/env bun
import { runHost } from "./commands/host";

const command = process.argv[2];

switch (command) {
  case "host": {
    await runHost();
    break;
  }
  default: {
    console.error(`Unknown command: ${command ?? "(none)"}\nUsage: rsynx host`);
    process.exit(1);
  }
}
