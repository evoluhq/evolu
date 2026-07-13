---
"@evolu/common": minor
"@evolu/nodejs": major
---

Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

Added WebSocket test helpers for native client setup and raw upgrade requests.

Made relay storage count duplicate timestamped messages only once when computing owner usage.

Renamed the Node.js `startRelay` API to `createRelay` and made it return a Resource-producing Task whose disposal owns the relay lifecycle.

Replaced the Node.js `createRun` and `ShutdownDep` APIs with `runMain`, which owns the root Run, handles termination signals, disposes returned resources, reports defects, and supports service and command exit behavior.
