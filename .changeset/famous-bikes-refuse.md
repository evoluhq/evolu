---
"@evolu/common": minor
---

Added explicit defaults

Use `withDefault(type, value)` to fill missing optional properties or accepted
`null` and `undefined` values. Invalid supplied values still fail validation.

Pass `{ strategy: "preserve" }` as the third argument to track whether the
default was used and restore the original absence when encoding. An explicitly
supplied value remains distinguishable even when it equals the default.

Configured defaults are reused by reference, including when Types are localized
with `localizeTypes`. `partial` retains localized field errors while disabling
defaults for missing properties.

**Prefer defaults in the view over defaults in your database schema.** Use
nullable columns and apply `??` when reading or displaying values unless the
default needs to be stored. Replacing `null` can enlarge rows unnecessarily and
erase the distinction between "not specified" and an explicit user decision.

```ts
import {
  assertEqual,
  assertOk,
  Boolean,
  nullOr,
  object,
  optional,
  withDefault,
} from "@evolu/common";

const Enabled = withDefault(nullOr(Boolean), true);

assertOk(Enabled.fromUnknown(null), true);
assertEqual(Enabled.to(true), true);

const Settings = object({
  enabled: withDefault(optional(Boolean), true, { strategy: "preserve" }),
});

const missing = Settings.fromUnknown({});
assertOk(missing, {
  enabled: { value: true, defaultUsed: true, original: "missing" },
});
assertEqual(Settings.to(missing.value), {});

assertOk(Settings.fromUnknown({ enabled: true }), {
  enabled: { value: true, defaultUsed: false },
});
```
