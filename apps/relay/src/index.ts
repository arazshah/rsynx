import { createServer } from "./server";

const port = Number(process.env.PORT ?? 8080);
const server = createServer(port);

console.log(
  JSON.stringify({
    event: `relay listening on port ${server.port}`,
    timestamp: new Date().toISOString(),
  }),
);
