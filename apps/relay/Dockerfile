# Build from the repository root, not this directory:
#   docker build -f apps/relay/Dockerfile -t rsynx-relay .
FROM oven/bun:1

WORKDIR /app

# Copy only package manifests first so `bun install` is cached across builds
# as long as dependencies don't change.
COPY package.json bun.lock ./
COPY apps/relay/package.json apps/relay/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN bun install --frozen-lockfile

# Now copy the rest of the source.
COPY tsconfig.json ./
COPY apps/relay apps/relay
COPY packages/protocol packages/protocol

WORKDIR /app/apps/relay
EXPOSE 8080
CMD ["bun", "run", "start"]
