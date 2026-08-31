---
"@evolu/common": minor
---

Improved boolean assertion narrowing

`assertTrue` now preserves TypeScript control-flow narrowing when passed a
boolean condition. Type guards therefore narrow their original value after the
assertion, while unknown values continue to be checked against exact `true`.

```ts
import { assertEqual, assertTrue, assertType } from "@evolu/common";

const value: unknown = "Evolu";
const isString = (value: unknown): value is string => typeof value === "string";

assertTrue(isString(value));
assertType<typeof value, string>();
assertEqual(value.toUpperCase(), "EVOLU");
```
