# @evolu/relay

A WebSocket relay server for Evolu that enables real-time synchronization between clients.

## Installation

```bash
npm install -g @evolu/relay
```

## Usage

### Start the relay server

```bash
npx @evolu/relay start
```

### Available options

```bash
npx @evolu/relay start --help
```

- `--port <number>` - Port to listen on (default: 4000)
- `--name <name>` - Database name (default: evolu-relay)
- `--enable-logging` - Enable logging

### Examples

```bash
# Start on custom port
npx @evolu/relay start --port 3000

# Start with logging enabled
npx @evolu/relay start --enable-logging

# Start with custom database name
npx @evolu/relay start --name my-relay-db
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build
pnpm build

# Start built application
pnpm start
```

## Docker

See [README.docker.md](./README.docker.md) for Docker setup instructions.

## Requirements

- Node.js ≥22.0.0
