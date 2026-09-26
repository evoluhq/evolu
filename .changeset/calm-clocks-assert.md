---
"@evolu/common": patch
---

Removed `TimestampTimeOutOfRangeError`

The error stood for a system clock past the last time Evolu timestamps can
represent, in August 10889, but `Time.now` already throws for such a clock, so
Evolu never reported it.

`TimestampTimeOutOfRangeError` is no longer an `EvoluError` or a
`TimestampError`, which is now only `TimestampDriftError`. Remove any
`case "TimestampTimeOutOfRangeError"` from switches over these errors.
