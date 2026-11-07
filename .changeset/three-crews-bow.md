---
"@evolu/common": patch
---

Accepted union arguments in Callbacks execute

`Callbacks.execute` of callbacks whose argument is a union, such as a `Result`, required an argument of each member's type at once. It now takes the union as one type.

```ts
import {
  assertEqual,
  createCallbacks,
  err,
  ok,
  type Result,
  testCreateDeps,
} from "@evolu/common";

const parsePort = (input: string): Result<number, string> => {
  const port = Number(input);
  return Number.isInteger(port) ? ok(port) : err(`Invalid port: ${input}`);
};

using callbacks = createCallbacks<Result<number, string>>(testCreateDeps());
const results: Array<Result<number, string>> = [];
const id = callbacks.register((result) => {
  results.push(result);
});

// The argument is the whole Result, not an Ok and an Err at once.
callbacks.execute(id, parsePort("8080"));
assertEqual(results, [ok(8080)]);
```
