---
"@evolu/common": minor
---

Added custom error wrappers for validation Types

`createTypeWithError` creates a root Type from an existing validator, an error
mapper, and a formatter. It forwards error-collection options automatically.
The source must use identity encoding; the wrapper preserves its valid values
and exposes its Output as Input.

```ts
import {
  assertEqual,
  assertErr,
  createTypeWithError,
  Number,
  String,
  union,
  type TypeError,
  type UnionError,
} from "@evolu/common";

interface ValueError extends TypeError<"Value"> {
  readonly cause: UnionError;
}

const Value = createTypeWithError(
  "Value",
  union(String, Number),
  (cause): ValueError => ({ type: "Value", cause }),
  () => "Enter text or a number.",
);

const result = Value.fromUnknown(false, { errors: "all" });
assertErr(result);
assertEqual(result.error.cause.errors.length, 2);
assertEqual(Value.formatError(result.error), "Enter text or a number.");
```
