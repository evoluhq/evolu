---
"@evolu/common": minor
---

Added strict environment configuration codecs

Use `env({ ... })` to decode CONSTANT_CASE environment variables into typed
camelCase settings. Declare fields directly for unprefixed variables such as
`PORT`, and put related fields in one-level CONSTANT_CASE namespace groups
such as `APP`. The decoded output stays flat. Duplicate output fields and
external names fail during construction.

TypeScript rejects fields declared as namespace groups and groups declared as
fields. Full identifier spelling and name lengths are checked during construction.

Field codecs validate values and encode them back to canonical strings. Field
Types can use `withDefault` for explicit defaults. Resolve source precedence
before replacing absence, or use the `preserve` strategy when later composition
needs supplied-input evidence. Environment access and source merging remain
application code.

Unprefixed fields select exact names. Namespace groups select all names with
their prefix and an underscore separator, ignoring casing during selection.
Incorrectly cased or unknown selected names fail validation. Unrelated variables
are ignored; misspelled unprefixed names or namespace prefixes may therefore
still look absent. Namespaces must omit the trailing underscore.

Optional fields may be absent; explicit `undefined` values are rejected.
Empty strings remain present and must satisfy the field Type.
Malformed and unknown selected names fail instead of silently using defaults.
Errors retain the original environment names. Non-object inputs fail with
standard object errors. Names follow `EnvName`: a
CONSTANT_CASE identifier of at most 255 characters including the prefix.

Matching own string properties are read from any non-null object, including
arrays and `process.env`. Prototypes and internal contents, such as Map
entries, are ignored. Missing required settings still fail validation.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  ByteLengthFromString,
  env,
  optional,
  PortFromString,
  typeErrorToIssues,
} from "@evolu/common";

const AppEnv = env({
  port: optional(PortFromString),
  APP: {
    maxOwnerBytes: optional(ByteLengthFromString),
  },
});
const config = AppEnv.fromUnknown({
  PORT: "04000",
  APP_MAX_OWNER_BYTES: "1MiB",
  HOME: "/home/evolu",
});
assertOk(config, { port: 4000, maxOwnerBytes: 1048576 });
assertEqual(AppEnv.to(config.value), {
  PORT: "4000",
  APP_MAX_OWNER_BYTES: "1048576",
});

const invalid = AppEnv.fromUnknown({ APP_POTR: "4000" });
assertErr(invalid);
assertEqual(typeErrorToIssues(AppEnv, invalid.error)[0]?.path, ["APP_POTR"]);
assertErr(AppEnv.fromUnknown({ PORT: "" }));
assertErr(AppEnv.fromUnknown({ PORT: undefined }));
assertOk(AppEnv.fromUnknown([]), {});
```
