---
"@evolu/common": patch
---

Add Multiton

Multiton manages multiple named instances using a key-based registry with structured disposal. It's used internally for Evolu instance caching to support hot reloading and prevent database corruption from multiple connections.

See the Multiton documentation for usage patterns and caveats.
