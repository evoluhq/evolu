---
"@evolu/common": minor
---

Added Email and Uuid Types, and conversions between Uuid and Id

`Email` accepts a valid email address as the WHATWG HTML Standard defines it,
the same rule browsers enforce for `<input type="email">`. It does not
normalize, and it accepts only ASCII, so use the `xn--` form of
internationalized domains. Compose `maxLength(254)(Email)` to enforce SMTP's
length limit.

`Uuid` accepts an RFC 9562 UUID of any version or variant in its canonical
lowercase form, so equal UUIDs are equal strings. Lowercase UUIDs from other
sources before validating them.

`uuidToId` and `idToUuid` convert between a `Uuid` and the `Id` with the same 16
bytes. Unlike `createIdFromString`, the conversion is reversible, so records
whose external keys are UUIDs don't need a separate column for the original key.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  Email,
  idToUuid,
  Uuid,
  uuidToId,
} from "@evolu/common";

assertOk(Email.fromUnknown("ada@example.com"), "ada@example.com");
assertErr(Email.fromUnknown("Ada <ada@example.com>"));

const uuid = Uuid.orThrow("0190a6f4-8c3e-7b2a-9d41-5e6f7a8b9c0d");
const todoId = uuidToId<"Todo">(uuid);

assertEqual(idToUuid(todoId), uuid);
```
