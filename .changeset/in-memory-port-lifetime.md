---
"@evolu/common": patch
---

Fixed in-memory transferred message port lifetime so transferred ports stayed usable while ownership moved between wrappers during disposal and re-creation.
