---
"@evolu/common": minor
---

Added `unregister` to `Callbacks`

`Callbacks.unregister` removes a registered callback without executing it, for
a request whose response will never come.

```ts
import { assertSame, createCallbacks, testCreateDeps } from "@evolu/common";

using callbacks = createCallbacks(testCreateDeps());
let calls = 0;
const id = callbacks.register(() => {
  calls++;
});

// The response will never come, so the callback is removed without running.
callbacks.unregister(id);
callbacks.execute(id);
assertSame(calls, 0);
```
