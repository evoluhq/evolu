---
"@evolu/common": patch
---

Fixed PADMÉ padding for lengths near and above 2 GiB

`createPadmePaddedLength` computed with 32-bit bitwise operators, so for a
length above 2,113,929,216 bytes it threw or returned a value smaller than the
length, and `createPadmePadding` threw. Both now pad every length up to
2^53 - 2^46 correctly and throw above it, where the padded length would exceed
`Number.MAX_SAFE_INTEGER`. Lengths up to 2,113,929,216 bytes pad exactly as
before, so the padding of synced changes, which are far smaller, does not
change.
