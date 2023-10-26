---
"@evolu/common-react": patch
---

Remove conditional queryCallback

Conditional useQuery callback wasn't documented, and it's an antipattern. With Kysely Relations, it's possible to nest related rows in queries now.
