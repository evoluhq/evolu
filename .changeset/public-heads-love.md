---
"@evolu/common": patch
---

Reported a WebSocket that stopped connecting as closed

`getReadyState` of a `createWebSocket` WebSocket returned `"connecting"` after it stopped connecting for good: when the constructor threw, `shouldRetryOnClose` declined a close, or the reconnect schedule ran out. It now returns `"closed"`, as the platform WebSocket does for a connection that couldn't be opened. While the WebSocket waits to retry, it still returns `"connecting"`. Evolu itself doesn't read it, so only apps that use `createWebSocket` directly are affected.
