# Evolu Relay - Docker Setup

Docker configuration for the Evolu Relay.

## 🚀 Quick Start for Developers

**Just one command to get started:**

```bash
cd apps/relay
pnpm docker:up
```

That's it! This will:

- ✅ Automatically build the Docker image
- ✅ Start the Evolu Relay service
- ✅ Show real-time logs
- ✅ Make the service available at `http://localhost:4000`

Press `Ctrl+C` to stop the service.

### Background Mode (Optional)

```bash
cd apps/relay

# Start in background
pnpm docker:up:detached

# View logs when needed
pnpm docker:logs

# Stop when done
pnpm docker:down
```

## 🔧 Advanced Usage

### All Available Commands

| Command                   | Description                                    | Auto-builds? | Persistence  |
| ------------------------- | ---------------------------------------------- | ------------ | ------------ |
| `pnpm docker:up`          | **Recommended**: Start in foreground with logs | ✅ Yes       | Named volume |
| `pnpm docker:up:detached` | Start in background                            | ✅ Yes       | Named volume |
| `pnpm docker:down`        | Stop services                                  | N/A          | N/A          |
| `pnpm docker:restart`     | Restart with rebuild                           | ✅ Yes       | Named volume |
| `pnpm docker:logs`        | View logs (live)                               | N/A          | N/A          |
| `pnpm docker:shell`       | Access running container shell                 | N/A          | N/A          |
| `pnpm docker:stats`       | View container resource usage                  | N/A          | N/A          |
| `pnpm docker:inspect`     | View container details                         | N/A          | N/A          |
| `pnpm docker:build`       | Build image only                               | N/A          | N/A          |
| `pnpm docker:clean`       | Clean up containers and images                 | N/A          | N/A          |
| `pnpm docker:clean:all`   | **Full cleanup**: Remove everything            | N/A          | N/A          |

### Manual Docker Commands (Alternative)

```bash
# Build manually
docker-compose build

# Run with Docker Compose
docker-compose up --build

# Run directly with Docker
docker run -p 4000:4000 evolu/relay:latest
```

## ❓ FAQ

**Q: Do I need to build the image first?**  
A: No! `pnpm docker:up` automatically builds and starts everything.

**Q: How do I update after code changes?**  
A: Just run `pnpm docker:restart` or stop and start again.

**Q: How do I know if it's working?**  
A: Check `http://localhost:4000` - you should get a "426 Upgrade Required" response (this is correct for WebSocket servers).

**Q: How do I see what's happening?**  
A: Use `pnpm docker:logs` to view live logs.

**Q: How do I access the container?**  
A: Use `pnpm docker:shell` to get shell access inside the running container.

**Q: How do I clean up everything?**  
A: Run `pnpm docker:clean:all` to remove all containers, images, and networks.

## 📁 Docker Files

- `Dockerfile` - Multi-stage Docker build configuration
- `docker-compose.yml` - Docker Compose configuration with health checks
- `.dockerignore` - Files to exclude from Docker build context

## ⚙️ Configuration

- **Port**: 4000 (modify in `docker-compose.yml` if needed)
- **Environment**: `NODE_ENV=production` in Docker
- **Health Check**: Built-in health monitoring via Docker Compose
- **Data Persistence**: SQLite database automatically persists via Docker volumes

### Container Details

| Component          | Value                 | Description                        |
| ------------------ | --------------------- | ---------------------------------- |
| **Container Name** | `evolu-relay-server`  | Easy identification                |
| **Image Name**     | `evolu/relay:latest`  | Tagged for production deployment   |
| **Network**        | `evolu-relay-network` | Isolated Docker network            |
| **Volume**         | `evolu-relay-data`    | Persistent SQLite database storage |
| **User**           | `evolu:nodejs` (1001) | Non-root user for security         |
| **Memory Limit**   | 1GB                   | Resource constraint                |
| **CPU Limit**      | 1.0                   | CPU resource constraint            |

## 🚨 Troubleshooting

| Issue                    | Solution                                                   |
| ------------------------ | ---------------------------------------------------------- |
| Build fails              | Run `pnpm docker:clean:all` and try again                  |
| Port already in use      | Change port in `docker-compose.yml` or stop other services |
| Container won't start    | Check logs with `pnpm docker:logs`                         |
| Need container access    | Use `pnpm docker:shell` for interactive shell              |
| Performance issues       | Check resources with `pnpm docker:stats`                   |
| Need to reset everything | Run `pnpm docker:clean:all`                                |

## 🔍 Monitoring & Debugging

### Real-time Monitoring

```bash
# View live logs
pnpm docker:logs

# Monitor resource usage
pnpm docker:stats

# Container details
pnpm docker:inspect

# Access container shell
pnpm docker:shell
```

### Inside Container Commands

```bash
# Access container
pnpm docker:shell

# Then inside container:
ls -la /app/apps/relay/data/     # View database files
ps aux                           # Check running processes
top                              # Monitor resource usage
netstat -tlnp                    # Check port bindings
```
