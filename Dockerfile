FROM oven/bun:1-alpine AS base
WORKDIR /app

# Builder
FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Runner
FROM base AS release
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Secure the container by running as a non-root user
USER bun
EXPOSE 3000

ENTRYPOINT [ "bun", "run", "src/index.ts" ]