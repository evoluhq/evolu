---
"@evolu/common": major
---

Updated the time testing API and added deterministic test ids.

**Breaking changes:**

- Changed `testCreateTime({ autoIncrement })` to accept `"microtask" | "sync"` instead of `boolean`

**Added:**

- Added `testCreateId()` for deterministic branded and unbranded ids in tests
