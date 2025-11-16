FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable pnpm
RUN pnpm install -g turbo
COPY . .

# Generate a partial monorepo with a pruned lockfile for the relay workspace
RUN turbo prune @evolu/relay --docker

# ------------------------------------------------------------
# Installer stage - build the pruned workspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm and turbo
RUN corepack enable pnpm
RUN pnpm install -g turbo

# Install dependencies from pruned lockfile
COPY --from=builder /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY --from=builder /app/out/full/ .
# Ensure README.md is available at the root for the build process
COPY --from=builder /app/README.md ./README.md
RUN turbo run build

# Create a minimal production deploy for the relay package
# Use legacy mode since inject-workspace-packages is not set
RUN pnpm --filter @evolu/relay deploy --prod --legacy /app/deploy

# ------------------------------------------------------------
# Runner stage - minimal runtime image
FROM base AS runner
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

# Copy the minimal deployed app (includes prod node_modules and dist)
COPY --from=installer --chown=evolu:nodejs /app/deploy/ ./

# Declare data volume for clarity and persistence
VOLUME ["/app/data"]



# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const net=require('net');const s=net.connect(4000,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"

# Start the application
CMD ["node", "dist/index.js"] 