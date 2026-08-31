---
"@evolu/common": patch
---

Corrected SameValue equality helper names

Renamed `eqStrict` to `eqSameValue` and `eqArrayStrict` to `eqArraySameValue`.
Their SameValue behavior through `Object.is` is unchanged.

```ts
import {
  assertFalse,
  assertTrue,
  eqArraySameValue,
  eqSameValue,
} from "@evolu/common";

assertTrue(eqSameValue(NaN, NaN));
assertFalse(eqSameValue(0, -0));
assertFalse(eqArraySameValue([{}], [{}]));
```
