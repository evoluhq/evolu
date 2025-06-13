---
"@evolu/common": patch
"@evolu/nodejs": patch
---

Add timing-safe comparison for WriteKey validation

### Security Improvements

- Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
- Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
- Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks
