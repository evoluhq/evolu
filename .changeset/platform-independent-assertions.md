---
"@evolu/common": minor
---

Added `assertOk`, `assertErr`, `IsSameType`, and exact `assertType`

These platform-independent assertions can be used in tests, documentation
examples, and application code without depending on a test framework.

`assertOk` and `assertErr` assert and narrow a Result variant. With an expected
value or error, they compare it using `eqData`; values outside Data require an
explicit `Eq`. Without an expected value, they leave the narrowed value or error
available for a separate assertion.

`IsSameType<A, B>` exposes exact type equality as a boolean type.
`assertType<Expected, Actual>()` uses that comparison and requires a
`CompileTimeError` argument when the types differ.

```ts
import {
  assertErr,
  assertOk,
  assertType,
  err,
  ok,
  type Err,
  type IsSameType,
  type Ok,
  type Result,
} from "@evolu/common";

interface ValuesNotFoundError {
  readonly type: "ValuesNotFound";
}

const success: Result<ReadonlyArray<number>, ValuesNotFoundError> = ok([1, 2]);
assertOk(success, [1, 2]);
assertType<Ok<ReadonlyArray<number>>, typeof success>();

const failure: Result<ReadonlyArray<number>, ValuesNotFoundError> = err({
  type: "ValuesNotFound",
});
assertErr(failure, { type: "ValuesNotFound" });
assertType<Err<ValuesNotFoundError>, typeof failure>();

const status = "ready" as const;
assertType<true, IsSameType<typeof status, "ready">>();

// `satisfies` checks assignability, so a narrower literal satisfies `string`.
status satisfies string;

// `assertType` requires exact equality, so `"ready"` and `string` differ.
// @ts-expect-error ⛔ assertType error: Expected and actual types must be identical
assertType<string, typeof status>();
```
