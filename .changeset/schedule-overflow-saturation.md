---
"@evolu/common": patch
---

Improved Schedule timing safety and validation.

Schedule now:

- Saturates computed delays to valid `Millis` values instead of throwing on overflow.
- Handles backwards-clock elapsed deltas without producing invalid branded values.
- Validates numeric Schedule options.

Also added:

- `saturateMillis` in the Time module for converting numbers to valid `Millis` values with overflow saturation.
- `NonNegativeFiniteNumber` in the Type module for validating non-negative finite numbers.
