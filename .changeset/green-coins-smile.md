---
"@evolu/common": minor
"@evolu/nodejs": minor
---

Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

Added WebSocket test helpers for native client setup and raw upgrade requests.

Made relay storage count duplicate timestamped messages only once when computing owner usage.
