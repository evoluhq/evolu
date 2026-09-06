---
"@evolu/common": minor
---

Gave byte-size literals a dedicated validation error

`ByteSizeLiteral` now reports `ByteSizeLiteralError` instead of `UnionError`.
Its message explains the expected format without expanding every union
alternative. The rejected value is in `value`, and `cause` retains the
underlying union failure for diagnostics. Accepted literals and encoding are
unchanged.

Validation options still apply to the underlying union: `{ errors: "all" }`
retains every alternative in `cause`, while formatting remains concise.

Use the `ByteSizeLiteral` localization key and `formatByteSizeLiteralError`,
available in every locale. Localizing an enclosing Type now selects this
formatter independently of generic union messages.

Code inspecting the old error must use the new tag and read union diagnostics
from `cause`. `ByteSizeLiteral` is now a named Type rather than an exposed union;
the unit-specific Types remain available separately.

```ts
import {
  assertEqual,
  assertErr,
  ByteSizeLiteral,
  localizeTypes,
  object,
} from "@evolu/common";
import { cs } from "@evolu/common/intl";

const invalid = ByteSizeLiteral.fromUnknown("1MB", { errors: "all" });
assertErr(invalid);

// @ts-expect-error ByteSizeLiteral errors have type "ByteSizeLiteral", not "Union".
const _oldTag: "Union" = invalid.error.type;
assertEqual(invalid.error.type, "ByteSizeLiteral");
assertEqual(invalid.error.cause.type, "Union");
assertEqual(invalid.error.cause.errors.length, 5);

const { czech } = localizeTypes(
  { Settings: object({ quota: ByteSizeLiteral }) },
  {
    czech: {
      Object: cs.formatObjectError,
      ByteSizeLiteral: cs.formatByteSizeLiteralError,
    },
  },
);
const result = czech.Settings.fromUnknown({ quota: "1MB" });
assertErr(result);
assertEqual(
  czech.Settings.formatError(result.error),
  'Hodnota "1MB" není literál velikosti v bajtech. Použijte hodnotu jako "512KiB" nebo "1MiB".',
);
```
