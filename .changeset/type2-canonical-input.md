---
"@evolu/common": minor
---

Added `CanonicalInput` to Type2.

`Type` now distinguishes its complete decoding boundary from the statically
known subtype returned by complete encoding:

```text
Input           ── partial decode ──▶ Output
CanonicalInput  ◀─── total encode ─── Output

CanonicalInput ⊆ Input
```

`CanonicalInput` is the declared return type of `to`. It contains every encoded
result and is itself contained by `Input`, but can be wider than the values
actually emitted. `Output` describes the semantic value, which can use a
different representation.

For `FiniteNumber`, `Output` also describes the encoded result precisely.
Its `Input` is correctly `number`, allowing decoding to reject `NaN` and
infinities, while its `Output` and `CanonicalInput` are `FiniteNumber`. Encoding
preserves that finite-number guarantee.

For `Int64FromInt64String`, `Output` cannot describe the encoded result. Its
`Input` is `string`, its `Output` is `Int64`, and its `CanonicalInput` is
`Int64String`. Encoding an `Int64` produces the validated string representation,
not an unrefined `string` or another `Int64`.

Structural Type factories derive `CanonicalInput` recursively. When a refinement
follows an arbitrary transformation, it conservatively retains the
transformation's return type because TypeScript cannot determine which values
the encoder returns for the narrowed `Output`.
