# Build from the repository root, not this directory:
#   docker build -f apps/web/Dockerfile -t rsynx-web .
FROM oven/bun:1

WORKDIR /app

# Copy only package manifests first so `bun install` is cached across builds
# as long as dependencies don't change.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

# Now copy the rest of the source.
COPY tsconfig.json ./
COPY apps/web apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["bun", "run", "start"]
