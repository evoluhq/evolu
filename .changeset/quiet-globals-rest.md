---
"@evolu/common": minor
---

Added disposable global test stubs

Added `testStubGlobal` for temporarily replacing a global property and restoring
its original descriptor with `using`.

```ts
import { assertEqual, assertFalse, testStubGlobal } from "@evolu/common";

const key = Symbol("test global");
{
  using _stub = testStubGlobal(key, 42);
  assertEqual(Reflect.get(globalThis, key), 42);
}
assertFalse(Reflect.has(globalThis, key));
```
