---
"@evolu/common": minor
---

Expanded platform-agnostic assertions

Added `assertEqualBytes`, `assertConditionAfterMicrotasks`, `assertInstanceOf`,
`assertLength`, `assertNotSame`, `assertNotEqual`, `assertThrows`,
`assertThrowsSame`, `assertThrowsInstanceOf`, `assertRejects`,
`assertRejectsSame`, and `assertRejectsInstanceOf` for portable invariants,
examples, and tests. `assertEqualBytes` compares a `Uint8Array` with expected
bytes from any numeric array-like representation.
`assertThrows` and `assertRejects` require either an expected value, compared
using Evolu equality, or an assertion function for custom verification. The
`Same` variants verify exact propagation, while the `InstanceOf` variants
return the narrowed failure for further inspection.

`assertEqual` and `assertNotEqual` now accept unknown values. Data
representations use Evolu's deep equality semantics, while unsupported values
are opaque and compare by identity. The default comparisons in `assertOk` and
`assertErr` use the same behavior.

Evolu assertions now throw `AssertionError`-compatible errors with structured
failure details. Node.js uses its native `AssertionError`, including diffs for
comparison assertions, while browsers and React Native use a compatible
fallback. `assert` also accepts optional structured diagnostics, including an
underlying error's cause.

```ts
import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertInstanceOf,
  assertLength,
  assertNotEqual,
  assertRejectsInstanceOf,
  assertSame,
  assertThrows,
  trySync,
} from "@evolu/common";

const actual: unknown = { name: "Ada" };
assertNotEqual(actual, { name: "Grace" });
assertLength(["Ada", "Grace"], 2);
assertEqualBytes(new Uint8Array([1, 2, 3]), [1, 2, 3]);

const cause = new Error("Unexpected value.");
assertThrows(() => {
  throw cause;
}, cause);

const rejection = await assertRejectsInstanceOf(
  Promise.reject(new TypeError("Unavailable.")),
  TypeError,
);
assertEqual(rejection.message, "Unavailable.");

const result = trySync(() => assert(false, "Expected true.", { cause }));

assertErr(result);
assertInstanceOf(result.error, Error);
assertSame(result.error.cause, cause);
```
