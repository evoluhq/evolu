---
"@evolu/common": patch
---

Declared toString and toJSON on Redacted

The `Redacted` interface now declares the `toString` and `toJSON` methods its
values already had. Both return `"<redacted>"`, so type-aware linters no longer
report `no-base-to-string` when a Redacted value is stringified.

```ts
import { assertEqual, assertType, createRedacted } from "@evolu/common";

using secret = createRedacted("sensitive");

assertType<ReturnType<typeof secret.toString>, "<redacted>">();
assertEqual(String(secret), "<redacted>");
```
