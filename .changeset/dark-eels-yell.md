---
"@evolu/common": minor
---

Added a path option that reports a cross-field error at one field

A rule spanning several properties, such as a range whose maximum must not be
below its minimum, is a `brand` or `createType` refinement of the whole object,
so `typeErrorToIssues` and Standard Schema validation reported its error at the
object itself, and form libraries could not show it at a field. A fallible
`brand` and a fallible child `createType` now take `{ path }`, described by the
new `ChildTypeOptions`, which locates the error within the validated value. The
error itself is unchanged, and the path is checked against the parent Output at
compile time.

```ts
import {
  assertEqual,
  assertErr,
  brand,
  err,
  FiniteNumber,
  object,
  ok,
  typeErrorToIssues,
  type TypeError,
} from "@evolu/common";

interface PriceRangeError extends TypeError<"PriceRange"> {}

const PriceRange = brand(
  "PriceRange",
  object({ min: FiniteNumber, max: FiniteNumber }),
  (value) =>
    value.min <= value.max
      ? ok()
      : err<PriceRangeError>({ type: "PriceRange" }),
  () => "The maximum must not be below the minimum.",
  { path: ["max"] },
);

const result = PriceRange.fromUnknown({ min: 20, max: 10 });
assertErr(result, { type: "PriceRange" });
assertEqual(typeErrorToIssues(PriceRange, result.error), [
  { path: ["max"], message: "The maximum must not be below the minimum." },
]);
```
