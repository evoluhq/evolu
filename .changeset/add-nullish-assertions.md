---
"@evolu/common": minor
---

Added nullish assertion helpers

Use `assertNotNull` to narrow away `null` while preserving `undefined`, and use
`assertNotUndefined` to narrow away `undefined` while preserving `null`.

```ts
import { assertNotNull, assertNotUndefined } from "@evolu/common";

const possiblyNull = undefined as string | null | undefined;
assertNotNull(possiblyNull);
expectTypeOf(possiblyNull).toEqualTypeOf<string | undefined>();

const possiblyUndefined = null as string | null | undefined;
assertNotUndefined(possiblyUndefined);
expectTypeOf(possiblyUndefined).toEqualTypeOf<string | null>();
```
