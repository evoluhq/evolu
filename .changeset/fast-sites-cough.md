---
"@evolu/common": minor
---

Added Types for ULIDs, ISBNs, IP addresses, hex colors, 32-bit and bigint bounds, and collection sizes

- `Ulid` accepts a canonical uppercase ULID, and `ulidToId` and `idToUlid`
  convert between a `Ulid` and the `Id` with the same 16 bytes.
- `Uint8ArrayFromBase64`, `Uint8ArrayFromBase64Url`, and `Uint8ArrayFromHex`
  decode encoded text to bytes and encode it back canonically.
- `Isbn` accepts a 13-digit ISBN without hyphens and checks its check digit.
- `IpAddress` accepts an IPv4 address or a canonical IPv6 address, and
  `IpAddressFromString` converts RFC 4291 IPv6 address text to its canonical
  form and accepts an `Ipv4Address` unchanged.
- `HexColor` accepts the lowercase `#rrggbb` form that `<input type="color">`
  produces by default.
- `includes` and `excludes` require or forbid a substring, and
  `maxUtf8ByteLength` bounds the UTF-8 size of a string.
- `Int32` and `UInt32` bound integers to 32 bits.
- `greaterThanBigInt`, `greaterThanOrEqualToBigInt`, `lessThanBigInt`,
  `lessThanOrEqualToBigInt`, and `betweenBigInt` bound bigints, and
  `ValidateBrandFactoryBigInt` guards bigint parameters of custom brand
  factories.
- `minSize` and `maxSize` bound the size of Sets, Maps, and Blobs, whose
  Output the new `ValueWithSize` interface describes.

Every locale of `@evolu/common/intl` translates the new error messages.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  betweenBigInt,
  BigInt,
  IpAddressFromString,
  maxSize,
  set,
  String,
  Ulid,
  idToUlid,
  ulidToId,
} from "@evolu/common";

const ulid = Ulid.orThrow("01ARZ3NDEKTSV4RRFFQ69G5FAV");
assertEqual(idToUlid(ulidToId(ulid)), ulid);

assertOk(IpAddressFromString.fromUnknown("2001:0DB8::1"), "2001:db8::1");

const Percent = betweenBigInt(0n, 100n)(BigInt);
assertOk(Percent.fromUnknown(42n), 42n);
assertErr(Percent.fromUnknown(101n));

const Tags = maxSize(2)(set(String));
assertErr(Tags.fromUnknown(new Set(["a", "b", "c"])));
```
