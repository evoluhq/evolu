FROM oven/bun:1.3.9-alpine AS bun-base

# Build stages use Bun for lockfile-native dependency install and turbo pruning.
# Runtime stays on Node.js because Relay is a Node process in production.

FROM bun-base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .

# Generate a partial monorepo for the relay workspace.
RUN bunx turbo prune @evolu/relay --docker

# ------------------------------------------------------------
# Installer stage - build the pruned workspace
FROM bun-base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install all dependencies in the pruned workspace to build relay.
COPY --from=builder /app/out/json/ .
RUN bun install --frozen-lockfile

# Copy source and build
COPY --from=builder /app/out/full/ .
# Ensure README.md is available at the root for the build process
COPY --from=builder /app/README.md ./README.md
RUN bunx turbo run build --filter @evolu/relay

# Keep only production dependencies for relay runtime.
RUN bun install --frozen-lockfile --production --filter @evolu/relay

# ------------------------------------------------------------
# Runner stage - minimal runtime image
FROM node:24-alpine AS runner
WORKDIR /app

# Ensure production runtime defaults
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 evolu --ingroup nodejs
RUN chown evolu:nodejs /app
USER evolu

# Ensure data directory exists for persistent storage
RUN mkdir -p /app/data

# Copy the pruned production workspace.
COPY --from=installer --chown=evolu:nodejs /app/ ./

# Declare data volume for clarity and persistence
VOLUME ["/app/data"]



# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const net=require('net');const s=net.connect(4000,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"

# Start the application
CMD ["node", "apps/relay/dist/index.js"]