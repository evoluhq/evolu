---
"@evolu/common": major
"@evolu/nodejs": minor
---

Improved wall-clock, performance, and monotonic time APIs.

**Common:**

- Replaced `Time.nowDateIso()` with the `Time.now("DateIso")` overload.
- Added `Time.performance` with a high-resolution clock and time origin, plus branded `PerformanceTime`, `PerformanceTimeOrigin`, and `PerformanceDuration` values.
- Added `performanceDurationBetween()` for measuring elapsed performance time.
- Made timeout IDs instance-owned so clearing an ID with another `Time` instance throws.
- Made native-range timeouts independent of wall-clock changes while retaining absolute-deadline handling for longer timeouts.
- Extended `formatMillisAsDuration()` to format days, weeks, and years.

**Node.js:**

- Added `NodejsTime` and `createNodejsTime()` with `hrtime()` for monotonic nanosecond readings.
- Added branded `HrTime` and `HrDuration` values with `hrDurationBetween()`.
- Added `hrDurationToMillis()` and `millisToHrDuration()` conversions.
