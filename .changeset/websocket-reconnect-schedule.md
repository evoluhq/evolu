---
"@evolu/common": minor
---

Added `webSocketReconnectSchedule` as the default WebSocket reconnect policy.

The schedule retries indefinitely with exponential backoff, a 100ms base, a
30s cap, and full jitter.
