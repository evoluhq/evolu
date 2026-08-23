---
"@evolu/common": minor
---

Added `eqUint8Array`

Use `eqUint8Array` to compare two Uint8Arrays by byte value.

```ts
import { assert, eqUint8Array } from "@evolu/common";

assert(
  eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
  "Expected equal bytes.",
);
```
