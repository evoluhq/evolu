---
"@evolu/common": patch
---

Distinguished positive and negative zero in equality

`eqNumber` and `eqData` now compare primitive values with `Object.is`,
JavaScript's SameValue algorithm. Therefore number and Data equality,
`assertEqual`, and the default comparisons in `assertOk` and `assertErr`
distinguish `0` from `-0` while still considering `NaN` equal to itself.
Structural lookup keys also preserve the distinction between `0` and `-0`.

```ts
import { assertFalse, eqData, eqNumber, structuralLookup } from "@evolu/common";

assertFalse(eqNumber(0, -0));
assertFalse(eqData({ value: 0 }, { value: -0 }));
assertFalse(structuralLookup(0) === structuralLookup(-0));
```
