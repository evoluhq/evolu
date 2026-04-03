---
"@evolu/common": minor
---

Added a new `StructuralMap` module for `Map`-like storage keyed by structural values instead of object identity.

`StructuralMap` was added for cases where callers already had immutable keys such as JSON-like values, `undefined`, or `Uint8Array` and wanted to look up shared state, cached values, or in-flight work without maintaining a separate canonical string id. Structurally equal arrays, objects, and byte arrays addressed the same entry even when they were different JavaScript instances.

`StructuralMap` worked by deriving a canonical structural id for each key and storing entries in a native `Map` keyed by that id. Repeated lookups of the same object, array, or `Uint8Array` instance reused cached ids through a `WeakMap`.

### Example

```ts
import { createStructuralMap } from "@evolu/common";

const map = createStructuralMap<
  { readonly id: string; readonly filter: readonly [string, string] },
  string
>();

map.set({ id: "items", filter: ["owner", "active"] }, "cached");

map.get({ id: "items", filter: ["owner", "active"] });
// => "cached"
```
