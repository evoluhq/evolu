---
"@evolu/nodejs": patch
---

Fixed createTimingSafeEqual throwing for arrays of different lengths

The Node.js `TimingSafeEqual` passed arrays straight to `node:crypto`, which
throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` when their lengths differ. It now
returns `false`, as `TimingSafeEqual` documents.
