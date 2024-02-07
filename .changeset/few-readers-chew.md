---
"@evolu/common": minor
---

Add createOrUpdate

This function is useful when we already have an `id` and want to create a
new row or update an existing one.

```ts
import * as S from "@effect/schema/Schema";
import { Id } from "@evolu/react";

// Id can be stable.
// 2024-02-0800000000000
const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;

evolu.createOrUpdate("todo", { id, title });
```
