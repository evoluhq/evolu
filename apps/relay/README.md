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
docker run -d --restart unless-stopped -p 4000:4000 -v evolu-relay-data:/app/data docker.io/evoluhq/relay:4
```

For Docker Compose, download the repository's
[`docker-compose.yml`](https://github.com/evoluhq/evolu/blob/main/apps/relay/docker-compose.yml),
which sets the same restart policy, and run `docker compose up` from the
directory containing that file.

Tags follow the npm package version: `4.0.0`, `4.0`, `4`, and `latest` for the
newest stable release. Prerelease versions only get their full version tag.

## Verify the image

Each image is signed with a GitHub artifact attestation. With the
[GitHub CLI](https://cli.github.com), check that this repository's Docker
workflow on `main` built an image, and print the digest it verified:

```bash
gh attestation verify oci://docker.io/evoluhq/relay:4.2.15 \
  --repo evoluhq/evolu \
  --signer-workflow evoluhq/evolu/.github/workflows/docker.yaml \
  --source-ref refs/heads/main \
  --format json \
  --jq '.[].verificationResult.statement.subject[] | "\(.name)@sha256:\(.digest.sha256)"'
```

To run exactly the image you verified, replace `docker.io/evoluhq/relay:4` in
the `docker run` command above, or the `image` in `docker-compose.yml`, with
the printed reference, such as `docker.io/evoluhq/relay@sha256:…`. Tags such as
`4` move to each new release, so verify each new version before you move to it.
[Supply chain](https://www.evolu.dev/docs/supply-chain) explains what the
attestation proves and what it doesn't.

## Restarts

A defect, a bug the relay cannot recover from, makes it close its connections
and exit with code 1, because it cannot prove that its shared state is still
intact. Run it under something that restarts it: the Docker restart policy
above, the Compose file, or a service manager such as systemd for the npm
package. Clients reconnect and sync what they missed.

## Configure

The relay reads `PORT` and Relay-specific `EVOLU_RELAY_*` environment variables:

| Variable                      | Default  | Description                                                                                          |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `PORT`                        | `4000`   | The TCP port to listen on, also supplied by hosting platforms.                                       |
| `EVOLU_RELAY_MAX_OWNER_BYTES` | No limit | The storage quota per owner, as a size literal such as `10MiB`.                                      |
| `EVOLU_RELAY_LOG_LEVEL`       | `log`    | The console level, from `trace` to `silent`. `debug` also logs connections, `trace` every SQL query. |

At `debug`, the log includes OwnerIds and the URLs of rejected connections. At
`trace`, it also includes every SQL query's parameters and result rows, among
them each owner's write key and encrypted changes. Use these levels only for
debugging, and keep such logs as private as the relay's database.

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

For uptime monitors and load balancers, the relay answers `GET` and `HEAD`
requests for `/health` with status 200 while its database file can be read and
with status 503 otherwise. The Docker health check requests it on `PORT`. Use a
fixed, nonzero port in Docker; `PORT=0` selects an unpredictable port that the
health check cannot discover.
The image exposes port 4000, so map a custom port explicitly:

```bash
docker run -d --restart unless-stopped -e PORT=4001 -p 4001:4001 -v evolu-relay-data:/app/data docker.io/evoluhq/relay:4
```

To add authorization or integrate the relay into your own server, use the
`createRelay` API from `@evolu/nodejs` instead. This package's
[`src/index.ts`](https://github.com/evoluhq/evolu/blob/main/apps/relay/src/index.ts)
is the complete example.
