import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "./server";

let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer(0); // let the OS pick a free port
});

afterAll(() => {
  server.stop(true);
});

describe("GET /", () => {
  test("serves the landing page", async () => {
    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("rsynx");
  });
});

describe("GET /i", () => {
  test("serves the install script", async () => {
    const res = await fetch(`http://localhost:${server.port}/i`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-shellscript");
    expect(await res.text()).toContain("#!/bin/sh");
  });
});

describe("unknown routes", () => {
  test("returns 404", async () => {
    const res = await fetch(`http://localhost:${server.port}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
