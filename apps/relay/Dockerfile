FROM node:22-alpine

# Install required dependencies and create non-root user
RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 evolu --ingroup nodejs && \
    npm install -g @evolu/relay@latest && \
    mkdir -p /app/data && \
    chown -R evolu:nodejs /app

WORKDIR /app
USER evolu

ENV RELAY_PORT=4000 \
    RELAY_NAME=evolu-relay \
    RELAY_ENABLE_LOGGING=false \
    NODE_ENV=production \
    LOG_LEVEL=error

EXPOSE ${RELAY_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${RELAY_PORT}

CMD ["sh", "-c", "node /usr/local/lib/node_modules/@evolu/relay/dist/src/cli.js start --port $RELAY_PORT --name $RELAY_NAME $([ \"$RELAY_ENABLE_LOGGING\" = \"true\" ] && echo --enable-logging)"] 