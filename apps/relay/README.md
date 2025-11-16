# Evolu Relay

Evolu Relay implementation using Node.js

We chose Node.js for stability, but we'll add a Bun version soon too.

## Usage

- **Docker image**: fastest path for most use cases
- **Node.js library** (`@evolu/nodejs`): for custom logging, auth, or tight server integration
- **Custom implementation**: re-implement for other runtimes (Bun, Deno, serverless)

### Run with Docker

```bash
docker pull docker.io/evoluhq/relay:latest
docker run --rm -p 4000:4000 docker.io/evoluhq/relay:latest
```

Point your app to `ws://localhost:4000` by setting the WebSocket transport in your Evolu config (see `apps/web/src/components/EvoluMinimalExample.tsx`):

#### Build and Test Locally

Run the relay from this repo to verify changes.

```bash
# From the repo root: build the image
docker build -f apps/relay/Dockerfile -t evolu/relay:dev .

# Run in background with persistent data volume
docker run -d --name evolu-relay \
  -p 4000:4000 \
  -v evolu-relay-data:/app/data \
  evolu/relay:dev

# Follow logs (Ctrl+C to stop tailing)
docker logs -f evolu-relay

# Stop & remove when done
docker rm -f evolu-relay
```

## Node.js Library

If you prefer to run in‑process or need custom configuration (logging, auth, etc.), use the Node.js library.

- Package: `@evolu/nodejs`
- API: `createNodeJsRelay`
