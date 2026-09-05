import { createServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
const server = createServer(port);

console.log(
  JSON.stringify({
    event: `web listening on port ${server.port}`,
    timestamp: new Date().toISOString(),
  }),
);
