---
"@evolu/relay": patch
---

Pinned the Docker image's Node.js base image by digest

The `evoluhq/relay` image was built from whatever `node:24-alpine` pointed to
at build time. It is now built from `node:24.22.0-alpine` pinned by digest, so
a re-pointed tag can't change it, and newer Node.js 24 releases reach the image
with relay releases. npm installs the relay into the image without running
install scripts, which no package in its dependency tree needs.

The `NODE_VERSION` build argument was removed. To build the image on another
Node.js version, change the `FROM` line in `apps/relay/Dockerfile`.
