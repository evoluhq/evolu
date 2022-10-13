---
"evolu": patch
---

Fix useEvoluFirstDataAreLoaded bug.

Empty table did not generate any patch so onQuery did not update queriesRowsCache.
