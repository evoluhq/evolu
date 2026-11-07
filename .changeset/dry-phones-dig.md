---
"@evolu/common": patch
---

Fixed ownership of transferred in-memory ports and their handlers

A dropped message releases the port transfers it carries. Forwarding a delivered
port moves its reservation to the next message, and a failed transfer-list read
leaves ownership unchanged.

Disposing a port wrapper clears its handler. The remaining messages stay queued
if the port survives, and delivery continues after a handler throws.
