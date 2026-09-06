---
"@evolu/common": patch
---

Reduced generated declarations for literal Types

Byte-size, duration, percentage, and digit-range declarations now preserve
references to shared Types instead of repeatedly expanding their definitions.
Accepted values and the unit Types' member and template-part APIs are preserved.

```ts
import {
  assertSame,
  assertType,
  ByteSizeLiteralKiB,
  Digit1To9,
  Digit1To59,
  DurationLiteralSeconds,
} from "@evolu/common";

assertSame(ByteSizeLiteralKiB.members[0].parts[0], Digit1To9);
assertType<(typeof ByteSizeLiteralKiB.members)[5]["parts"][1], ".5KiB">();
assertSame(DurationLiteralSeconds.members[0].parts[0], Digit1To59);
```
