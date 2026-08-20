---
"@evolu/common": patch
---

Updated the random dependency to 5.5.1

Seeded random generators, including `testCreateRandom`, `testCreateRandomLib`,
`testCreateDeps`, and `testCreateId`, now produce a different deterministic
sequence. Update snapshots and fixtures that assert their exact output.
