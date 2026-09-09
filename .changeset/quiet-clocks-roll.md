---
"@evolu/common": patch
---

Fixed timestamp counter overflow after the clock ran ahead of wall time

When the 16-bit counter of a Hybrid Logical Clock timestamp is exhausted, the
timestamp now advances the logical millisecond by one and resets the counter,
while still respecting the timestamp range and the configured drift limit.
Previously, once the clock was ahead of wall time, for example after syncing
with a device whose clock is fast, every local write shared one millisecond and
a large batch failed with a counter overflow that left the write queue pending.
The `TimestampCounterOverflowError` type is now unreachable and was removed.
Clock failures are `TimestampDriftError` or `TimestampTimeOutOfRangeError`.
