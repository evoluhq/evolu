---
"@evolu/common": patch
---

Improved Type.orThrow validation messages

`Type.orThrow` now throws an `Error` whose message comes from the Type's
`formatError`, including localized formatters. The original validation error
remains available in `cause`. With `{ errors: "all" }`, the cause retains all
collected errors while the message describes the first issue.

Typed-input assertion failures retain their existing messages. The generic
`getOrThrow` function is unchanged.

```ts
import {
  assertEqual,
  assertErr,
  assertInstanceOf,
  PortFromString,
  trySync,
} from "@evolu/common";

assertEqual(PortFromString.orThrow("4000"), 4000);

const failed = trySync(() => PortFromString.orThrow("http"));
assertErr(failed);
assertInstanceOf(failed.error, Error);
assertEqual(failed.error.message, 'The value "http" is not a decimal integer.');
assertEqual(failed.error.cause, { type: "IntFromString", value: "http" });
```
