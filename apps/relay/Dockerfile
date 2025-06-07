FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable pnpm
RUN pnpm install -g turbo
COPY . .

# Generate a partial monorepo with a pruned lockfile for the relay workspace
RUN turbo prune @evolu/relay --docker

# ------------------------------------------------------------
# Installer stage - build the pruned workspace
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat
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

# ------------------------------------------------------------
# Runner stage - minimal runtime image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 evolu --ingroup nodejs
RUN chown evolu:nodejs /app
USER evolu

# Copy built application
COPY --from=installer --chown=evolu:nodejs /app/apps/relay/dist ./dist

# Copy the complete node_modules with all dependencies
COPY --from=installer --chown=evolu:nodejs /app/node_modules ./node_modules

# Copy the built workspace packages that the relay needs at runtime
COPY --from=installer --chown=evolu:nodejs /app/packages/common/dist ./node_modules/@evolu/common/dist
COPY --from=installer --chown=evolu:nodejs /app/packages/common/package.json ./node_modules/@evolu/common/package.json
COPY --from=installer --chown=evolu:nodejs /app/packages/nodejs/dist ./node_modules/@evolu/nodejs/dist
COPY --from=installer --chown=evolu:nodejs /app/packages/nodejs/package.json ./node_modules/@evolu/nodejs/package.json

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000 || exit 1

# Start the application
CMD ["node", "dist/index.js"] 