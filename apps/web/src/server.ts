const PUBLIC_DIR = `${import.meta.dir}/../public`;

/**
 * Serves the static landing page and install script. No framework, no
 * build step — apps/relay's Bun.serve()-only pattern, extended to files.
 */
export function createServer(port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      const { pathname } = new URL(req.url);

      if (pathname === "/") {
        return new Response(Bun.file(`${PUBLIC_DIR}/index.html`), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (pathname === "/i") {
        return new Response(Bun.file(`${PUBLIC_DIR}/install.sh`), {
          headers: { "content-type": "text/x-shellscript; charset=utf-8" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
