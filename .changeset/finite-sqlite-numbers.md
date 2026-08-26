---
"@evolu/common": patch
---

Restricted SQLite values to finite numbers

`SqliteValue`, schema columns, SQL parameters, mutations, query parameters, and synchronized changes now reject `NaN`, `Infinity`, and `-Infinity`. This prevents SQLite and query serialization from silently changing non-finite values.

Use `FiniteNumber` or a narrower finite Type instead of unrestricted `Number` for SQLite-backed values.

```ts
import {
  assertFalse,
  assertType,
  FiniteNumber,
  Number,
  SqliteValue,
  type SqliteValue as SqliteValueType,
} from "@evolu/common";

const unrestrictedNumber = Number.orThrow(1);
// @ts-expect-error A Number can contain non-finite values and is not assignable to SqliteValue.
const _oldValue: SqliteValueType = unrestrictedNumber;

const finiteNumber = FiniteNumber.orThrow(1);
const _sqliteValue: SqliteValueType = finiteNumber;
assertType<FiniteNumber, typeof finiteNumber>();
assertFalse(SqliteValue.is(Infinity));
```

When using another Standard Schema library, its inferred numeric output must be assignable to `FiniteNumber`. The library can perform the runtime validation itself and brand the validated output compatibly. For example, Zod 4's `number` validator rejects non-finite numbers but still infers `number`, so adapt its output after validation:

```ts
import * as z from "zod";
import { assertType, type FiniteNumber } from "@evolu/common";

// Zod 4 numbers are finite by default; Evolu Type Number models all JavaScript numbers.
const ZodFiniteNumber = z
  .number()
  .transform((value): FiniteNumber => value as FiniteNumber);

assertType<FiniteNumber, z.output<typeof ZodFiniteNumber>>();
```

By the way, this is one of the reasons Evolu Type exists: it favors stricter defaults, and every constraint is automatically reflected in the output type as a brand.
