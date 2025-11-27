---
"@evolu/common": patch
---

Update Result documentation with block scope pattern for multiple void operations

```ts
// Before - inventing names to avoid name clash
const baseTables = createBaseSqliteStorageTables(deps);
if (!baseTables.ok) return baseTables;

const relayTables = createRelayStorageTables(deps);
if (!relayTables.ok) return relayTables;

// After - block scopes avoid name clash
{
  const result = createBaseSqliteStorageTables(deps);
  if (!result.ok) return result;
}
{
  const result = createRelayStorageTables(deps);
  if (!result.ok) return result;
}
```
