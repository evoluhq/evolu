---
"@evolu/common": minor
---

Added descriptor-preserving object key filtering

Use `filterObjectKeys` to select own string-keyed properties without reading
their values or invoking getters. It preserves property descriptors, including
non-enumerable properties, and ignores inherited and symbol properties. The
result is a new ordinary object whose declared properties are optional and readonly.

```ts
import { assertEqual, assertType, filterObjectKeys } from "@evolu/common";

const selected = filterObjectKeys(
  { APP_PORT: "4000", HOME: "/home/evolu" },
  (key) => key.startsWith("APP_"),
);
assertEqual(selected, { APP_PORT: "4000" });
assertType<
  typeof selected,
  { readonly APP_PORT?: string; readonly HOME?: string }
>();
```
