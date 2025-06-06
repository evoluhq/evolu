# Evolu Relay

A WebSocket relay server for the Evolu database system that enables real-time synchronization between clients.

## 🚀 Quick Start

### Docker Development (Recommended)

```bash
cd apps/relay
pnpm docker:up
```

### Production Deployment

```bash
# Complete server setup + deployment
pnpm deploy:full
```

The relay will be available at `http://localhost:4000` (Docker) or your server's IP:4000 (production)

## 📖 Documentation

- **[Docker Setup](./README.docker.md)** - Complete Docker containerization guide

## 🔧 Development

### Local Development (Node.js)

```bash
pnpm dev    # Start with file watching
pnpm build  # Build TypeScript
pnpm start  # Start built application
```

### Docker Development

```bash
pnpm docker:up           # Start with logs
pnpm docker:up:detached  # Start in background
pnpm docker:down         # Stop containers
pnpm docker:logs         # View logs
pnpm docker:shell        # Access container shell
pnpm docker:clean        # Clean up everything
```

## 🛠️ Available Commands

### Development

| Command      | Description                                 |
| ------------ | ------------------------------------------- |
| `pnpm dev`   | Start development server with file watching |
| `pnpm build` | Build TypeScript to JavaScript              |
| `pnpm start` | Start the built application                 |
| `pnpm clean` | Clean build artifacts                       |

### Docker

| Command                   | Description                          |
| ------------------------- | ------------------------------------ |
| `pnpm docker:up`          | Build and start containers with logs |
| `pnpm docker:up:detached` | Start containers in background       |
| `pnpm docker:down`        | Stop all containers                  |
| `pnpm docker:restart`     | Restart containers with rebuild      |
| `pnpm docker:logs`        | View container logs                  |
| `pnpm docker:shell`       | Access running container shell       |
| `pnpm docker:stats`       | View container resource usage        |
| `pnpm docker:clean`       | Remove containers and cleanup        |

## 📋 Requirements

- **Node.js** ≥22.0.0
- **Docker** (for containerized development/deployment)
- **pnpm** (workspace package manager)

## 🔗 Integration

After deployment, your Evolu applications can connect to the relay:

**Development**: `ws://localhost:4000`  
**Production**: `ws://your-server-ip:4000`

The relay handles WebSocket connections and data synchronization across all connected Evolu applications.

---

📚 **Quick Links**:

- [Docker Setup Guide](./README.docker.md) - Local development and testing
