---
"@evolu/common": major
---

Refactored Time module for type safety, consistency, and better abstractions.

**Type safety:**

- Changed `Time.now()` return type from `number` to `Millis`
- Added `Millis` branded type with efficient 6-byte serialization (max value: year 10889)
- Added `minMillis` and `maxMillis` constants
- Both `now()` and `nowIso()` now throw on invalid values for consistent error handling

**Timer abstraction:**

- Added `Time.setTimeout` and `Time.clearTimeout` for platform-agnostic timers
- Added `TimeoutId` opaque type for timeout handles
- Added `TestTime` interface with `advance()` for controllable time in tests
- Added `testCreateTime` with `startAt` and `autoIncrement` options

**Duration literals:**

- Renamed `DurationString` to `DurationLiteral`
- Each duration has exactly one canonical form (e.g., "1000ms" must be written as "1s")
- Added decimal support: "1.5s" (1500ms), "1.5h" (90 minutes)
- Added weeks ("1w" to "51w") and years ("1y" to "99y")
- Removed combination syntax ("1h 30m") in favor of decimals ("1.5h")
- Months not supported (variable length)

**UI responsiveness constants:**

- `ms60fps` (16ms frame budget at 60fps)
- `ms120fps` (8ms frame budget at 120fps)
- `msLongTask` (50ms long task threshold for use with `yieldNow`)
