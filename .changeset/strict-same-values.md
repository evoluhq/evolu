---
"@evolu/common": patch
---

Made `eqStrict` a reflexive SameValue comparison

`eqStrict` now uses `Object.is`, matching Node.js `assert.strictEqual`. It
considers `NaN` equal to itself and distinguishes `0` from `-0`.

`eqArrayStrict` inherits the same semantics for its elements.
