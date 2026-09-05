---
"@evolu/nodejs": minor
---

Allowed main Tasks to return errors

`runMain` accepts fallible Tasks. A returned error is fatal: it is preserved in
`Error.cause`, reported through `reportDefect`, and sets `process.exitCode` to 1.
Cleanup finishes before `runMain` resolves.

```ts
import {
  assertEqual,
  IntFromString,
  ok,
  type Task,
  type TypeError,
} from "@evolu/common";
import { runMain } from "@evolu/nodejs";

const main: Task<void, TypeError> = () => {
  const port = IntFromString.fromUnknown("4000");
  if (!port.ok) return port;

  assertEqual(port.value, 4000);
  return ok();
};

await runMain(main, { mode: "command" });
```
