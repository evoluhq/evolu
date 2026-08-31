---
"@evolu/common": minor
---

Exposed binary codec helpers

Added public Buffer helpers for encoding numbers, flags, non-negative integers,
lengths, strings, and run-length encoded values.

```ts
import {
  assertEqual,
  createBuffer,
  decodeString,
  encodeString,
} from "@evolu/common";

const buffer = createBuffer();
encodeString(buffer, "Evolu");

assertEqual(decodeString(createBuffer(buffer.unwrap())), "Evolu");
```
