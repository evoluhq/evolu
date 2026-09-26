---
"@evolu/common": patch
---

Removed `TimestampTimeOutOfRangeError`

The error reported a timestamp past the last time Evolu timestamps can
represent, in August 10889. Evolu checks every received timestamp against the
system clock before using it, so only a system clock set to within minutes of
that date, or a tampered database, could reach it. Evolu now throws there, as
it already does for a system clock past that date.

`TimestampTimeOutOfRangeError` is no longer an `EvoluError` or a
`TimestampError`, which is now only `TimestampDriftError`. Remove any
`case "TimestampTimeOutOfRangeError"` from switches over these errors.
