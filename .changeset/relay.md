---
"@evolu/relay": major
---

Published the configurable relay package

The relay was a private workspace app that only shipped as a Docker image. It
is now published to npm with the `evolu-relay` executable, so it can run with
`npx @evolu/relay`. The `evoluhq/relay` Docker image installs the published
package and is built as part of every release that publishes a new relay
version.

The relay reads its port from `PORT` and its per-owner storage quota
from `EVOLU_RELAY_MAX_OWNER_BYTES`, as a size literal such as `10MiB`.
Bare byte counts such as `1048576` are not accepted; use `1MiB` instead.
`PORT` supports hosting platforms that supply the listening port. There is no
`EVOLU_RELAY_PORT` override. The port still defaults to 4000. Leaving the quota
unset imposes no per-owner storage limit; `0B` permits no stored bytes.
Invalid supplied values never fall back to defaults or disable the quota.

Ports must be integers from 0 through 65535; zero requests an automatically
assigned listening port. An empty, invalid, or unknown `EVOLU_RELAY_*`
variable stops the relay with a formatted validation error, before creating
the data directory or initializing its database. Startup reports the first
validation message and preserves all collected errors in the Error's `cause`.
The Docker health check uses the configured `PORT`; use a fixed, nonzero port
when running the image.

Environment names must exactly match the declared CONSTANT_CASE names. Incorrect
casing within the `EVOLU_RELAY_` namespace is reported as an unknown variable.
Casing is not repaired, and double underscores do not introduce nested settings.
