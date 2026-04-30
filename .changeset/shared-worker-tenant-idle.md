---
"@evolu/common": patch
---

Kept SharedWorker Evolu tenants alive briefly after the last instance was released so immediate dispose-and-recreate flows continue using the same local-first runtime.
