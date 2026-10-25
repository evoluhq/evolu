# syntax=docker/dockerfile:1

# The digest pins the base image, so a re-pointed tag can't change it.
# Dependabot proposes each Node.js 24 release and base rebuild a week after it
# is published (.github/dependabot.yml).
# droast ignore=DF011 reason="The published Relay package needs the Node runtime; no separate compilation stage is needed."
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

# The published @evolu/relay version, or a packed tarball path relative to the
# build context for verifying unpublished changes (see CONTRIBUTING.md). Why the
# image installs the published package: see
# docs/adr/relay-image-installs-published-package.md.
ARG RELAY_PACKAGE=@evolu/relay@latest

# No package in the relay's tree needs an install script, and @evolu/nodejs
# ships its SQLite addon prebuilt, so none runs. Without a lockfile, npm
# resolves the dependencies' version ranges at build time, so it takes only
# versions published at least a day ago, as the workspace does
# (pnpm-workspace.yaml), except Evolu's own packages, which the Docker workflow
# builds the image from soon after npm serves them.
# droast ignore=DF008,DF031 reason="cd scopes installation to the temporary context mount; release CI supplies an exact package version, while manual builds default to latest."
RUN --mount=type=bind,target=/context,readonly \
    cd /context && \
    npm install --global --ignore-scripts --min-release-age=1 \
      "--min-release-age-exclude=@evolu/*" "${RELAY_PACKAGE}" && \
    npm cache clean --force

ENV NODE_ENV=production
WORKDIR /app
RUN mkdir data && chown node:node data
USER node

# The relay stores its SQLite database in the data directory.
VOLUME ["/app/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 4000}/health`).then((response) => process.exit(response.ok ? 0 : 1), () => process.exit(1))"]

CMD ["evolu-relay"]
