---
"@evolu/common": minor
---

Added Types for string formats, calendar dates, Unicode text, and collections

The new string formats accept one canonical spelling and do not normalize input;
only `Ipv6AddressFromString` converts other spellings:

- `Base64` and `Hex`, with `uint8ArrayToBase64`, `base64ToUint8Array`,
  `uint8ArrayToHex`, and `hexToUint8Array`. `Hex` is lowercase and holds
  whole bytes.
- `uuidVersion(version)`, `UuidV4`, and `UuidV7`, which check the version and
  variant of a `Uuid`.
- `Hostname` (RFC 1123, lowercase), `Ipv4Address`, and `Ipv6Address` (RFC 5952
  canonical text). `Ipv6AddressFromString` converts RFC 4291 IPv6 address
  text to its canonical form.
- `PhoneNumberE164` and `Iban`, which verifies the IBAN check digits.
- `endsWith(suffix)`, the counterpart of `startsWith`.

`PlainDateIso` accepts a calendar date such as `2024-02-29` and rejects dates
that do not exist. `ValidDate` rejects an Invalid Date, which `Date` accepts.
`DateIsoFromRfc3339` decodes RFC 3339 date-times with an offset or without
milliseconds to `DateIso`, and `FiniteNumberFromString` decodes decimal number
strings, including exponents.

`wellFormed` and `WellFormedString` reject lone surrogates, which are replaced
when text is stored as UTF-8. `normalized(form)` requires a Unicode
normalization form, and `normalize` converts text to one explicitly.

`unique` rejects arrays with equal items, `minEntries` and `maxEntries` bound
the entry count of records and objects, and `nonEmptyArray` narrows an array
Type's Output to `NonEmptyReadonlyArray`.

Every locale of `@evolu/common/intl` translates the new error messages.

```ts
import {
  array,
  assertEqual,
  assertErr,
  assertOk,
  Ipv6AddressFromString,
  nonEmptyArray,
  PlainDateIso,
  String,
  unique,
} from "@evolu/common";

assertOk(PlainDateIso.fromUnknown("2024-02-29"), "2024-02-29");
assertErr(PlainDateIso.fromUnknown("2023-02-29"));

assertOk(
  Ipv6AddressFromString.fromUnknown("2001:DB8:0:0:0:0:0:1"),
  "2001:db8::1",
);

const Tags = unique(nonEmptyArray(array(String)));
const tags = Tags.orThrow(["local-first", "sqlite"]);
assertEqual(tags[0], "local-first");
assertErr(Tags.fromUnknown([]));
assertErr(Tags.fromUnknown(["sqlite", "sqlite"]));
```
