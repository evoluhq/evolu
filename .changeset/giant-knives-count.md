---
"@evolu/common": patch
---

Rejected user-defined unique indexes

Evolu now throws an assertion when creating an instance whose `indexes` option
contains a unique index, including partial and composite unique indexes.
Devices can independently create records with the same business value while
offline. A unique constraint would reject these records during synchronization.

Remove `.unique()` from existing index definitions. When duplicates matter,
make them visible in the application and offer a way to resolve them, such as
merging contacts or soft-deleting a duplicate. See
[Uniqueness](https://www.evolu.dev/docs/schema#uniqueness) for the distributed
data model and application guidance.
