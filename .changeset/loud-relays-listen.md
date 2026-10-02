---
"@evolu/relay": minor
---

Added EVOLU_RELAY_LOG_LEVEL to set the relay's log level

The relay reads its console level from `EVOLU_RELAY_LOG_LEVEL`: `trace`,
`debug`, `log`, `info`, `warn`, `error`, or `silent`, defaulting to `log`.
Before, connection events were logged only at `debug`, which could not be
enabled without rebuilding the image. `debug` logs each connection, and `trace`
also every SQL query. An unknown level stops the relay with a validation error,
like other invalid `EVOLU_RELAY_*` variables.
