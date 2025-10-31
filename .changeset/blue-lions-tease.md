---
"@evolu/common": patch
---

Non-initiator always responds in sync protocol for completion feedback

The non-initiator (relay) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables sync completion detection for initiators (clients).
