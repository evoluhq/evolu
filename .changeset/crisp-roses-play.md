---
"@evolu/common": minor
---

Added fnv1a32 for fast non-cryptographic hashing of bytes

`fnv1a32` computes the 32-bit FNV-1a hash of a `Uint8Array`. It suits hash
tables, bucketing, and fingerprints that detect accidental changes, but it is
not collision resistant, so never use it for integrity or authentication. Pass
a previous result to continue hashing across several arrays.

```ts
import { assertEqual, fnv1a32, utf8ToBytes } from "@evolu/common";

assertEqual(fnv1a32(utf8ToBytes("foobar")), 0xbf9cf968);
assertEqual(
  fnv1a32(utf8ToBytes("bar"), fnv1a32(utf8ToBytes("foo"))),
  fnv1a32(utf8ToBytes("foobar")),
);
```
