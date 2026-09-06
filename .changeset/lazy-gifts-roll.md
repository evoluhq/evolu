---
"@evolu/common": minor
---

Gave duration and percentage literals dedicated validation errors

`DurationLiteral` and `PercentageLiteral` now report `DurationLiteralError` and
`PercentageLiteralError` instead of generic union errors. Each error retains
the rejected `value` and the underlying union failure in `cause`, while its
default message gives examples of the expected format.

Validation options still apply to the underlying unions: `{ errors: "all" }`
retains every alternative in `cause`, while formatting remains concise.

Every locale exports `formatDurationLiteralError` and
`formatPercentageLiteralError`. Use the matching `DurationLiteral` and
`PercentageLiteral` keys when localizing these Types or enclosing schemas.

These are now named Types rather than exposed unions, so they no longer expose
`.members`. Duration unit Types still expose their members. Use `fromUnknown`
for dynamic input; the typed `from`, `to`, and `orThrow` methods require a valid
literal.

```ts
import {
  assertEqual,
  assertErr,
  DurationLiteral,
  PercentageLiteral,
  localizeTypes,
  object,
} from "@evolu/common";
import { cs } from "@evolu/common/intl";

const duration = DurationLiteral.fromUnknown("60s", { errors: "all" });
assertErr(duration);

// @ts-expect-error DurationLiteral errors have type "DurationLiteral", not "Union".
const _oldDurationTag: "Union" = duration.error.type;
assertEqual(duration.error.type, "DurationLiteral");
assertEqual(duration.error.cause.type, "Union");
assertEqual(duration.error.cause.errors.length, 7);

const percentage = PercentageLiteral.fromUnknown("101%", { errors: "all" });
assertErr(percentage);

// @ts-expect-error PercentageLiteral errors have type "PercentageLiteral", not "Union".
const _oldPercentageTag: "Union" = percentage.error.type;
assertEqual(percentage.error.type, "PercentageLiteral");
assertEqual(percentage.error.cause.type, "Union");
assertEqual(percentage.error.cause.errors.length, 4);

const { czech } = localizeTypes(
  { Settings: object({ delay: DurationLiteral, jitter: PercentageLiteral }) },
  {
    czech: {
      Object: cs.formatObjectError,
      DurationLiteral: cs.formatDurationLiteralError,
      PercentageLiteral: cs.formatPercentageLiteralError,
    },
  },
);
const invalid = czech.Settings.fromUnknown({ delay: "60s", jitter: "50%" });
assertErr(invalid);
assertEqual(
  czech.Settings.formatError(invalid.error),
  'Hodnota "60s" není literál délky trvání. Použijte hodnotu jako "500ms" nebo "1.5s".',
);
```
