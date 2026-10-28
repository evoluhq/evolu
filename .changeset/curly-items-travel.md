---
"@evolu/nodejs": patch
"@evolu/relay": patch
---

Logged requests the relay can't decode only at debug level

A client that sent malformed frames in a loop could fill the relay's disk with
logs: each one logged `invalid protocol request` with its decoding error's stack
at the default level, about 2 KB per frame, while the relay kept the connection
open. A malformed request is the client's failure, so the relay now logs it at
`debug`, which `EVOLU_RELAY_LOG_LEVEL=debug` shows.
