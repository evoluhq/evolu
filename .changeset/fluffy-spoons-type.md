---
"@evolu/common": patch
---

Rejected negative and fractional counts in minLength, maxLength, and length

`minLength(-1)` accepted every value, `maxLength(-1)` rejected every value, and
`maxLength(1.5)` behaved as `maxLength(1)`. These factories now take their count
through the new `ValidateBrandFactoryCount`, which accepts only a non-negative
integer literal, so such calls fail to compile with "Count must be a
non-negative integer." Runtime behavior is unchanged. The new count factories
`maxUtf8ByteLength`, `minSize`, `maxSize`, `minEntries`, and `maxEntries` use
the same guard.

```ts
import { maxLength, minLength, String } from "@evolu/common";

minLength(0)(String);
// @ts-expect-error Count must be a non-negative integer.
minLength(-1)(String);
// @ts-expect-error Count must be a non-negative integer.
maxLength(1.5)(String);
```
