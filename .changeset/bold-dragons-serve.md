---
"@evolu/common": patch
---

Fixed redundant messages when reconciling small mismatched ranges

A mismatched range with too few timestamps to split into fingerprints was
answered with timestamps from the start of the owner's history instead of the
range's own. Synchronization still converged, but the other side resent every
message in that range. The range's own timestamps are now sent.
