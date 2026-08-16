---
"@evolu/common": minor
---

Added `PositiveFiniteNumber`

`PositiveFiniteNumber` validates finite numbers greater than zero and remains
compatible with APIs requiring a `NonNegativeFiniteNumber`.

```ts
import { NonNegativeFiniteNumber, PositiveFiniteNumber } from "@evolu/common";

const value = PositiveFiniteNumber.orThrow(0.1);

expectTypeOf(value).toMatchTypeOf<NonNegativeFiniteNumber>();
expectOk(PositiveFiniteNumber.fromUnknown(1), 1);
expectErr(PositiveFiniteNumber.fromUnknown(0), {
  type: "Positive",
  value: 0,
});
expectErr(PositiveFiniteNumber.fromUnknown(Infinity), {
  type: "Finite",
  value: Infinity,
});
```
