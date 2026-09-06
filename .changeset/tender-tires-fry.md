---
"@evolu/common": minor
---

Added identifier Types and casing conversions

Validate identifiers with `CamelCaseIdentifier`, `PascalCaseIdentifier`,
`SnakeCaseIdentifier`, `KebabCaseIdentifier`, or `ConstantCaseIdentifier`, and
convert between them with functions such as `constantCaseToCamelCase`, which
turns `HTTP2_PORT` into `http2Port`. Conversions preserve word boundaries, so
converting back restores the original spelling.

An identifier is one or more ASCII words, each starting with a letter and
continuing with letters or digits. Every uppercase letter in camelCase and
PascalCase starts a word: `httpUrl` corresponds to `HTTP_URL`, while `httpURL`
corresponds to `HTTP_U_R_L`. Words never start with a digit, because camelCase
cannot mark a word boundary before one. Join an abbreviation such as `2FA` to
the previous word, as in `MAX2FA_ATTEMPTS` and `max2faAttempts`, or spell the
number out, as in `TWO_FACTOR_SECRET`.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertType,
  camelCaseToConstantCase,
  constantCaseToCamelCase,
  CamelCaseIdentifier,
  ConstantCaseIdentifier,
} from "@evolu/common";

const input = ConstantCaseIdentifier.fromUnknown("HTTP2_PORT");
assertOk(input);
const camel = constantCaseToCamelCase(input.value);
assertEqual(camel, "http2Port");
assertType<typeof camel, CamelCaseIdentifier>();

const constant = camelCaseToConstantCase(camel);
assertEqual(constant, input.value);
assertType<typeof constant, ConstantCaseIdentifier>();

assertErr(ConstantCaseIdentifier.fromUnknown("HTTP_2_PORT"));
assertErr(CamelCaseIdentifier.fromUnknown("http_port"));

assertErr(ConstantCaseIdentifier.fromUnknown("MAX_2FA_ATTEMPTS"));
const attempts = ConstantCaseIdentifier.orThrow("MAX2FA_ATTEMPTS");
assertEqual(constantCaseToCamelCase(attempts), "max2faAttempts");
assertErr(ConstantCaseIdentifier.fromUnknown("2FA_SECRET"));
const secret = ConstantCaseIdentifier.orThrow("TWO_FACTOR_SECRET");
assertEqual(constantCaseToCamelCase(secret), "twoFactorSecret");
```

Use the `identifier` Brand factory to add these rules to an existing string
Type, for example `identifier("CONSTANT_CASE")(maxLength(64)(String))`.
Conversions return only the destination brand, since changing the spelling can
invalidate other constraints such as length. `formatIdentifierError` is
available in every supported locale.
