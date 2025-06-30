---
"@evolu/common": patch
---

Improve createdAt handling in mutations

This release enhances the handling of the `createdAt` column in Evolu mutations, providing more flexibility for data migrations and external system integrations while maintaining distributed system semantics.

### Changes

**createdAt Behavior:**

- `insert`: Always sets `createdAt` to current timestamp
- `upsert`: Sets `createdAt` to current timestamp if not provided, or uses custom value if specified
- `update`: Never sets `createdAt` (unchanged behavior)

**Documentation Improvements:**

- Updated JSDoc for `DefaultColumns` with clear explanations of each column's behavior
- Clarified that `updatedAt` is always set by Evolu and derived from CrdtMessage timestamp
- Added guidance for using custom timestamp columns when deferring sync for privacy
- Enhanced mutation method documentation with practical examples

### Example

```ts
evolu.upsert("todo", {
  id: externalId,
  title: "Migrated todo",
  createdAt: new Date("2023-01-01"), // Preserve original timestamp
});
```
