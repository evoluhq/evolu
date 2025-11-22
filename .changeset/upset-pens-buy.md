---
"@evolu/common": patch
---

Prevent redundant WebSocket close calls

Added a check to ensure socket.close() is only called if the WebSocket is not already closing or closed, preventing unnecessary operations and potential errors.
