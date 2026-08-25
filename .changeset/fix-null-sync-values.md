---
"@evolu/common": patch
---

Fixed synchronization of nullable column updates

Setting a nullable column to `null` now synchronizes across devices instead of
throwing an assertion error.
