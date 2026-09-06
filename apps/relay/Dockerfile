# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine

# The published @evolu/relay version, or a packed tarball path relative to the
# build context for verifying unpublished changes (see CONTRIBUTING.md).
ARG RELAY_PACKAGE=@evolu/relay@latest

RUN --mount=type=bind,target=/context,readonly \
    cd /context && \
    npm install --global "${RELAY_PACKAGE}" && \
    npm cache clean --force

ENV NODE_ENV=production
WORKDIR /app
RUN mkdir data && chown node:node data
USER node

# The relay stores its SQLite database in the data directory.
VOLUME ["/app/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const net=require('node:net');const socket=net.connect(Number(process.env.PORT ?? 4000),'127.0.0.1',()=>{socket.end();process.exit(0)});socket.on('error',()=>process.exit(1))"]

CMD ["evolu-relay"]
