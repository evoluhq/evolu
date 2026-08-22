---
"@evolu/common": minor
---

Added fixed-length mutable Array construction

Use `createMutableArray` to preallocate an Array when its final length is known
and fill it with indexed writes.

```ts
import { createMutableArray } from "@evolu/common";

const values = createMutableArray<number>(3);

for (let index = 0; index < values.length; index++) {
  values[index] = index * 10;
}

expect(values).toEqual([0, 10, 20]);
```
