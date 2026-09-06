---
"@evolu/common": minor
---

Added a startsWith string Brand factory

Use `startsWith(prefix)(String)` to require an exact, case-sensitive prefix
without changing the string. Compose it with other string Types to preserve
their constraints. Each literal prefix produces a distinct brand; an empty
prefix accepts every string allowed by the parent Type.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertType,
  maxLength,
  startsWith,
  String,
  type Brand,
} from "@evolu/common";

const EnvName = startsWith("APP_")(maxLength(64)(String));
const result = EnvName.fromUnknown("APP_PORT");
assertOk(result, "APP_PORT");
assertType<
  typeof result.value,
  string & Brand<"MaxLength64"> & Brand<"StartsWithAPP_">
>();
assertEqual(EnvName.to(result.value), "APP_PORT");
assertErr(EnvName.fromUnknown("app_PORT"));

const prefix = globalThis.String("APP_");
// @ts-expect-error Expected must be one concrete literal value.
startsWith(prefix);
```

All 43 locales export `formatStartsWithError` for use with `localizeTypes`.
Messages include the value and required prefix, with quotes and control
characters escaped.

```ts
import {
  assertEqual,
  assertErr,
  localizeTypes,
  startsWith,
  String,
} from "@evolu/common";
import { cs } from "@evolu/common/intl";

const EnvName = startsWith("APP_")(String);
const localized = localizeTypes(
  { EnvName },
  {
    cs: {
      [EnvName.name]: cs.formatStartsWithError,
      String: cs.formatStringError,
    },
  },
);
const result = localized.cs.EnvName.fromUnknown("PORT");
assertErr(result);
assertEqual(
  localized.cs.EnvName.formatError(result.error),
  'Hodnota "PORT" musí začínat na "APP_".',
);
```
