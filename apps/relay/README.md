# Evolu Relay

Evolu Relay provides sync and backup for Evolu apps. This package is the
reference relay built on Node.js. It is published to npm as `@evolu/relay` and
to Docker Hub as [`evoluhq/relay`](https://hub.docker.com/r/evoluhq/relay).

The relay listens on port 4000 by default and stores its SQLite database in
the `data` directory of the current working directory. Point your app to
`ws://localhost:4000` by setting the WebSocket transport in your Evolu config.

## Run with npm

```bash
npx @evolu/relay
```

## Run with Docker

```bash
docker run --rm -p 4000:4000 -v evolu-relay-data:/app/data docker.io/evoluhq/relay:4
```

For Docker Compose, download the repository's
[`docker-compose.yml`](https://github.com/evoluhq/evolu/blob/main/apps/relay/docker-compose.yml)
and run `docker compose up` from the directory containing that file.

Tags follow the npm package version: `4.0.0`, `4.0`, `4`, and `latest` for the
newest stable release. Prerelease versions only get their full version tag.

## Configure

The relay reads `PORT` and Relay-specific `EVOLU_RELAY_*` environment variables:

| Variable                      | Default  | Description                                                     |
| ----------------------------- | -------- | --------------------------------------------------------------- |
| `PORT`                        | `4000`   | The TCP port to listen on, also supplied by hosting platforms.  |
| `EVOLU_RELAY_MAX_OWNER_BYTES` | No limit | The storage quota per owner, as a size literal such as `10MiB`. |

Quota values use `ByteSizeLiteral`, such as `0B`, `512KiB`, or `1.5GiB`.
Bare byte counts such as `1048576` are not accepted; use `1MiB` instead.
Leave the variable unset for no per-owner storage limit, or set a quota
appropriate for your deployment. `0B` allows no stored bytes; it does not disable
the quota. A per-owner quota is not a limit on total disk usage.

An invalid `PORT`, or an empty, malformed, or unknown `EVOLU_RELAY_*` variable,
stops the relay with a formatted validation error. Invalid supplied values
never fall back to defaults. `EVOLU_RELAY_PORT` is not supported; use `PORT`.

```bash
PORT=4001 EVOLU_RELAY_MAX_OWNER_BYTES=10MiB npx @evolu/relay
```

The Docker health check follows `PORT`. Use a fixed, nonzero port in Docker;
`PORT=0` selects an unpredictable port that the health check cannot discover.
The image exposes port 4000, so map a custom port explicitly:

```bash
docker run --rm -e PORT=4001 -p 4001:4001 -v evolu-relay-data:/app/data docker.io/evoluhq/relay:4
```

To add authorization or integrate the relay into your own server, use the
`createRelay` API from `@evolu/nodejs` instead. This package's
[`src/index.ts`](https://github.com/evoluhq/evolu/blob/main/apps/relay/src/index.ts)
is the complete example.
