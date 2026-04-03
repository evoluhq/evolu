---
"@evolu/common": minor
---

Added `result` Type factory and `typed` overload for props-less discriminants

**Result Type factory:**

- `result(okType, errType)` — creates a Type for validating serialized Results from storage, APIs, or message passing
- `UnknownResult` — validates `Result<unknown, unknown>` for runtime `.is()` checks

**typed overload:**

- `typed(tag)` now accepts just a tag without props for simple discriminants like `typed("Pending")`
- Added `TypedType<Tag, Props?>` helper type for the return type of `typed`
