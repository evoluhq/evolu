---
"@evolu/common": patch
---

Fixed relative console timestamps showing a negative duration

A relative timestamp from `createConsoleFormatter` printed `+-0.500s` when the
clock was set back or `startTime` was ahead of the clock. It now shows `+0.000s`.
