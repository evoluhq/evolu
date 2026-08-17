---
"@evolu/common": patch
---

Removed `incrementPositiveInt`

Use `PositiveInt.orThrow(increment(value))` when incrementing a `PositiveInt`.
Unlike `incrementPositiveInt`, this reports an invariant violation instead of
saturating at the maximum safe integer.

```ts
import { increment, PositiveInt } from "@evolu/common";

// @ts-expect-error The common module type has no incrementPositiveInt property.
type IncrementPositiveInt =
  (typeof import("@evolu/common"))["incrementPositiveInt"];

const value = PositiveInt.orThrow(1);

expect(PositiveInt.orThrow(increment(value))).toBe(2);
```
