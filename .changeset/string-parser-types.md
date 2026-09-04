---
"@evolu/common": minor
---

Added `IntFromString` and `BooleanFromString`

Both Types parse text inputs such as environment variables, URL query
parameters, and form fields. `IntFromString` accepts an optional minus sign
and digits within the safe integer range and preserves JavaScript's negative
zero. `BooleanFromString` accepts exactly `true` and `false`, so a boolean
has one spelling in every source. Both errors have localized messages in
every `@evolu/common/intl` locale.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertSame,
  BooleanFromString,
  IntFromString,
} from "@evolu/common";

assertOk(IntFromString.fromUnknown("4000"), 4000);
assertErr(IntFromString.fromUnknown("4000.5"), {
  type: "IntFromString",
  value: "4000.5",
});
const negativeZero = IntFromString.orThrow("-0");
assertSame(negativeZero, -0);
assertEqual(IntFromString.to(negativeZero), "-0");
assertOk(BooleanFromString.fromUnknown("true"), true);
assertErr(BooleanFromString.fromUnknown("yes"), {
  type: "BooleanFromString",
  value: "yes",
});
```
