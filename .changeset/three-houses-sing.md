---
"@evolu/common": patch
---

Preserved microtask order after flushing a batch immediately

A scheduled flush now runs only for its own batch, so a later batch waits for
its place in the microtask queue.
