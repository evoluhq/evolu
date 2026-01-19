---
"@evolu/common": minor
---

Added optional equality function to `Ref` and `ReadonlyStore` interface. `Ref.set` and `Ref.modify` now return `boolean` indicating whether state was updated. `Store` now uses `Ref` internally for state management.
