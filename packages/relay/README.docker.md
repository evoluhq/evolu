# Docker Setup

Docker configuration for the Evolu Relay server.

## Quick Start

```bash
# Start the relay server
pnpm docker:up
```

The relay will be available at `http://localhost:4000`.

## Available Commands

| Command             | Description     |
| ------------------- | --------------- |
| `pnpm docker:build` | Build the image |
| `pnpm docker:up`    | Start with logs |
| `pnpm docker:down`  | Stop containers |

## Development Mode

```bash
# Build the development image
pnpm docker:dev:build

# Start the development server
pnpm docker:dev:up

# Stop development server
pnpm docker:dev:down
```

## Configuration

- **Port**: 4000 (modify in `docker-compose.yml`)
- **Database**: SQLite database persists via Docker volumes
- **Health Check**: Built-in monitoring via Docker Compose
