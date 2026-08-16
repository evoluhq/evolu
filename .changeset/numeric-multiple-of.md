---
"@evolu/common": patch
---

Clarified exact decimal constraints

`multipleOf` accepts canonical positive decimal string literals such as
`"0.1"`. This keeps declarative divisors exact instead of converting them to
IEEE-754 numbers. Invalid or dynamic divisors are rejected by TypeScript, so
Type construction no longer performs redundant runtime divisor validation.

Clarified that `PositiveDecimalString` preserves exact decimal values as
canonical strings and does not implicitly provide decimal arithmetic.

```ts
import {
  FiniteNumber,
  multipleOf,
  PositiveDecimalString,
  type Brand,
} from "@evolu/common";

const Tenths = multipleOf("0.1")(FiniteNumber);
type Tenths = typeof Tenths.Output;

expectTypeOf<Tenths>().toEqualTypeOf<FiniteNumber & Brand<"MultipleOf0.1">>();

expectOk(Tenths.fromUnknown(0.3), 0.3);
expectErr(Tenths.fromUnknown(0.31), {
  type: "MultipleOf0.1",
  value: 0.31,
  divisor: "0.1",
});

expectOk(PositiveDecimalString.fromUnknown("10.01"), "10.01");

const invalidDeclarations = () => {
  // @ts-expect-error Divisors are exact decimal string literals.
  multipleOf(0.1);

  // @ts-expect-error Trailing fractional zeroes are not canonical.
  multipleOf("0.10");
};

expectTypeOf(invalidDeclarations).toBeFunction();
```
