# Use Node.js 22 Alpine for smaller base image
FROM node:22-alpine AS base

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .npmrc ./
COPY turbo.json ./
COPY README.md ./

# Copy source code
COPY packages/ ./packages/
COPY apps/relay/ ./apps/relay/

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile --filter @evolu/relay...

# Build stage
FROM base AS builder

# Build packages in dependency order
RUN cd packages/common && pnpm run build
RUN cd packages/nodejs && pnpm run build 
RUN cd apps/relay && pnpm run build

# Production stage - optimized for size
FROM node:22-alpine AS production

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S evolu -u 1001 -G nodejs

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Set working directory and create with proper ownership
WORKDIR /app
RUN chown evolu:nodejs /app

# Switch to non-root user early
USER evolu

# Copy only necessary files for production install
COPY --chown=evolu:nodejs package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=evolu:nodejs .npmrc ./
COPY --chown=evolu:nodejs turbo.json ./

# Copy built packages and relay app (include built assets and package.json)
COPY --from=builder --chown=evolu:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=evolu:nodejs /app/apps/relay/ ./apps/relay/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --filter @evolu/relay... --production

# Clean up pnpm cache and temporary files
RUN pnpm store prune && \
    rm -rf ~/.pnpm-store

# Set working directory to relay app
WORKDIR /app/apps/relay

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000 || exit 1

# Start the application
CMD ["pnpm", "start"] 