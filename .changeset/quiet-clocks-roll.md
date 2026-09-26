---
"@evolu/common": patch
---

Fixed timestamp counter overflow after the clock ran ahead of wall time

When the 16-bit counter of a Hybrid Logical Clock timestamp is exhausted, the
timestamp now advances the logical millisecond by one and resets the counter.
The result is still checked against the five-minute drift limit, and rollover
past the last representable time, in August 10889, throws.
Previously, once the clock was ahead of wall time, for example after syncing
with a device whose clock is fast, every local write shared one millisecond and
a large batch failed with a counter overflow that left the write queue pending.

`TimestampCounterOverflowError` was removed and is no longer a `TimestampError`
or an `EvoluError`; remove any `case "TimestampCounterOverflowError"` from
switches over these errors.
