---
"@evolu/common": minor
---

Added `ByteLength` with human-readable literals

`ByteLength` is the canonical non-negative safe integer number of bytes, as
`Millis` is for time. It rejects JavaScript's negative zero so zero has one
canonical representation. `ByteSizeLiteral` validates sizes such as
`"1023MiB"` or `"1.5GiB"` at compile time and runtime using the binary units
`B`, `KiB`, `MiB`, `GiB`, and `TiB`. Each unit stays below 1024, so
`1024KiB` is written as `"1MiB"`, and a half is the only decimal because it
is the only one that is exact in every binary unit. APIs can accept `ByteSize` and normalize it with
`byteSizeToByteLength`, and `ByteLengthFromString` parses either a number of
bytes or a literal from text such as an environment variable.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  ByteLength,
  ByteLengthFromString,
  byteSizeToByteLength,
  type ByteSize,
} from "@evolu/common";

const quota: ByteSize = "1MiB";
assertEqual(byteSizeToByteLength(quota), 1048576);
assertEqual(byteSizeToByteLength(ByteLength.orThrow(1000)), 1000);
assertErr(ByteLength.fromUnknown(-0));
assertOk(ByteLengthFromString.fromUnknown("10MiB"), 10485760);
```
