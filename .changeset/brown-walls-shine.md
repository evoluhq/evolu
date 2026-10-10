---
"@evolu/common": patch
"@evolu/nodejs": patch
"@evolu/web": patch
---

Removed runtime checks that types already guarantee

Functions no longer validate again at runtime what their parameter types
already prove. A value that breaks its type can only come from a wrong cast or
plain JavaScript, so only such values behave differently:

- `getOk` and `Run.ok` no longer assert that the Result is Ok, so an Err gives
  `undefined`.
- `retry` and `repeat` no longer validate the delay a Schedule returns. A
  fractional delay goes to the timer unchanged, and with `createTime` an
  infinite one waits until the Run is aborted. `testCreateTime` throws for both.
- `withDefault` no longer rejects a `strategy` other than `"preserve"`. Such a
  value, including `"replace"`, decodes like `"preserve"`, except inside
  `partial`, where it replaces.
- `percentageToRatio`, `computeBalancedBuckets`, `fibonacciAt`, and
  `hrDurationToMillis` no longer validate their results.
- `exponential`, `linear`, `fibonacci`, `jitter`, and `compensate` saturate a
  delay computed from a wrongly typed value instead of throwing, and `fixed` and
  `windowed` return it unchanged. `elapsed`, `during`, `maxElapsed`,
  `resetScheduleAfter`, `fixed`, `windowed`, and `compensate` take a `NaN`
  reading from a wrongly implemented `Time` as the maximum elapsed time.
  `modifyDelay` still throws when its function returns `NaN`.
- `createEvolu` no longer validates the name it builds from `appName`, and the
  web SQLite driver no longer validates the directory name it builds from a
  database name.

Checks that keep a wrongly typed value from hanging or silently breaking a
limit stay: `each`, `race`, `any`, `firstN`, and `firstNSettled` reject an
empty array, Semaphores reject permit counts below 1, and `durationToMillis`
rejects a malformed duration.

The decoder that `json` returns still throws for JSON text that does not match
the Type, now with the validation error as the cause.
