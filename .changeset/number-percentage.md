---
"@evolu/common": minor
---

Added readable percentage inputs to the Number module.

`Percentage` follows the same pattern as `Duration`: APIs accept a readable,
compile-time-validated literal for values written in code, or a validated
numeric value for computed and dynamic inputs.

```ts
// Readable static values.
jitter("25%")(schedule);
spaced("30s");

// Validated computed values.
jitter(Ratio.orThrow(computedRatio))(schedule);
spaced(Millis.orThrow(computedMillis));
```

This keeps call sites self-explanatory (`"25%"` instead of the ambiguous `0.25`)
without sacrificing numeric precision or runtime validation.

- `PercentageLiteral` represents canonical values from `"0%"` to `"100%"` with up to one decimal place.
- `Percentage` accepts either a `PercentageLiteral` or a validated `Ratio`.
- `percentageToRatio` converts either representation to a numeric `Ratio`.
