# Evolu Relay

Evolu Relay implementation using Node.js

## Usage

- **Docker image**: fastest path for most use cases
- **Node.js library** (`@evolu/nodejs`): for custom logging, auth, or tight server integration
- **Custom implementation**: re-implement for other runtimes (Bun, Deno, serverless)

### Run with Docker

Get the image from Docker Hub: https://hub.docker.com/r/evoluhq/relay (image: `docker.io/evoluhq/relay`).

```bash
docker pull docker.io/evoluhq/relay:latest
docker run --rm -p 4000:4000 docker.io/evoluhq/relay:latest
```

- Point your app to `ws://localhost:4000` by setting the WebSocket transport in your Evolu config (see `apps/web/src/components/EvoluMinimalExample.tsx`):

```ts
const evolu = Evolu.createEvolu(evoluReactWebDeps)(Schema, {
  ...(process.env.NODE_ENV === "development" && {
    transports: [{ type: "WebSocket", url: "ws://localhost:4000" }],
  }),
});
```

- Pin to a specific version if needed (e.g., `:1.2.3`).
- `latest` tracks the most recent stable release; prereleases are tagged by full version.

## Node.js Library

If you prefer to run in‑process or need custom configuration (logging, auth, etc.), use the Node.js library and/or build your own container.

- Package: `@evolu/nodejs`
- API: `createNodeJsRelay`

We chose Node.js for stability, but we'll add a Bun version soon too.
