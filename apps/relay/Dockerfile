FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc README.md ./
COPY packages/ ./packages/
COPY apps/relay/ ./apps/relay/

# Install only relay and its local workspace dependencies.
RUN pnpm install --frozen-lockfile --filter relay...

# Build relay and the packages it depends on.
RUN pnpm --filter relay... build

# Create a minimal production deploy for the relay package.
RUN pnpm --filter relay --prod deploy --legacy /app/deploy

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

# Copy the minimal deployed app.
COPY --from=builder --chown=evolu:nodejs /app/deploy/ ./

# Declare data volume for clarity and persistence
VOLUME ["/app/data"]



# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const net=require('net');const s=net.connect(4000,'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"

# Start the application
CMD ["node", "dist/src/index.js"]