---
"@evolu/common": patch
---

Added time formatting utilities

- `formatMillisAsDuration(millis)` - formats as human-readable duration (`1.234s`, `1m30.000s`, `1h30m45.000s`)
- `formatMillisAsClockTime(millis)` - formats as clock time (`HH:MM:SS.mmm`)
- Added `/*#__PURE__*/` annotation to `Millis` for better tree-shaking
