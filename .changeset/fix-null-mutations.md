---
"@evolu/common": patch
---

Restored explicit null values in mutations

`insert`, `update`, and `upsert` now store explicit `null` values in nullable columns, including columns in local-only tables.
