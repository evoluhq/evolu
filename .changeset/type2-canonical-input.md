---
"@evolu/common": minor
---

Added `CanonicalInput` to Type2.

`Type` now distinguishes its complete decoding boundary from the precise subset
produced by complete encoding:

```text
Input           ── partial decode ──▶ Output
CanonicalInput  ◀─── total encode ─── Output

CanonicalInput ⊆ Input
```

`CanonicalInput` precisely describes what `to` returns. `Input` contains every
encoded result, but can also contain invalid or noncanonical decoding
candidates. `Output` describes the semantic value, which can use a different
representation.

For `FiniteNumber`, `Output` also describes the encoded result precisely.
Its `Input` is correctly `number`, allowing decoding to reject `NaN` and
infinities, while its `Output` and `CanonicalInput` are `FiniteNumber`. Encoding
preserves that finite-number guarantee.

For `Int64FromInt64String`, `Output` cannot describe the encoded result. Its
`Input` is `string`, its `Output` is `Int64`, and its `CanonicalInput` is
`Int64String`. Encoding an `Int64` produces the validated string representation,
not an unrefined `string` or another `Int64`.

Structural Type factories derive `CanonicalInput` recursively, preserving this
precision in composed Types.
