---
"@evolu/common": patch
---

Updated Kysely to 0.29.7

Kysely 0.29.7 fixes connection handling in controlled transactions and escaping in its MSSQL JSON helpers. Evolu uses Kysely only to build and compile SQL, so queries and their results don't change.
