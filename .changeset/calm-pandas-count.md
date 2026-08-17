---
"@evolu/common": minor
---

Added canonical decimal string Types

`DecimalString` preserves exact signed base-10 decimal values as canonical
strings. Canonical means that every value has one accepted spelling: leading
zeroes, trailing fractional zeroes, `-0`, plus signs, and exponent notation are
rejected. Sign-refinement factories and their predefined Types model positive,
non-negative, negative, and non-positive decimal strings without converting them
to JavaScript numbers.

TypeScript template literal types can describe a fixed number of digit
positions, but not arbitrarily long integer and fractional parts. `DecimalString`
therefore uses a Brand so its TypeScript type accepts only values validated by
the Type.

```ts
import {
  DecimalString,
  NonNegativeDecimalString,
  PositiveDecimalString,
} from "@evolu/common";

expectOk(DecimalString.fromUnknown("-10.5"), "-10.5");
expectOk(NonNegativeDecimalString.fromUnknown("0"), "0");
expectOk(PositiveDecimalString.fromUnknown("10.5"), "10.5");

expectErr(DecimalString.fromUnknown("10.50"), {
  type: "DecimalString",
  value: "10.50",
});
expectErr(NonNegativeDecimalString.fromUnknown("-10.5"), {
  type: "NonNegativeDecimalString",
  value: "-10.5",
});
expectErr(PositiveDecimalString.fromUnknown("0"), {
  type: "PositiveDecimalString",
  value: "0",
});
```
