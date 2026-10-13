---
"@evolu/common": patch
---

Named the undefined column in the error an invalid mutation throws

Without `exactOptionalPropertyTypes`, which Evolu requires, TypeScript accepts
`evolu.update("todo", { id, title: undefined })`, and the mutation threw only
"Invalid DbChange for table 'todo'." It now names the column and says to omit
it instead.
