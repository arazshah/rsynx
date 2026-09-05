# Build from the repository root, not this directory:
#   docker build -f apps/web/Dockerfile -t rsynx-web .
#
# No `bun install` here: apps/web has zero runtime dependencies (it never
# imports from node_modules), and skipping it avoids a Bun bug where
# `bun install`'s summary output crashes on CPUs lacking AVX support —
# see https://github.com/oven-sh/bun/issues/30613 (unresolved as of
# 2026-09, affects all Bun versions after 1.3.8).
FROM oven/bun:1

WORKDIR /app/apps/web
COPY apps/web .

EXPOSE 3000
CMD ["bun", "run", "start"]
