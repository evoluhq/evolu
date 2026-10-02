---
"@evolu/nodejs": minor
"@evolu/relay": patch
---

Added a health endpoint to the relay

`createRelay` now answers `GET` and `HEAD` requests for `/health` with status
200 and `{"status":"ok"}` while its database file can be read, and with status
503 and `{"status":"error"}` otherwise, so uptime monitors and load balancers
can check a relay. Other plain HTTP requests get status 426 instead of no
response at all. The relay's Docker image now checks `/health` instead of only
opening a TCP connection, so a relay that cannot read its database file is
reported unhealthy.
