---
"@evolu/react-native": patch
"@evolu/common": patch
"@evolu/web": patch
---

Add in-memory database support for testing and temporary data

This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:

- Testing scenarios where data persistence isn't needed
- Temporary data processing
- Forensically safe handling of sensitive data

**Usage:**

```ts
const evolu = createEvolu(deps)(Schema, {
  inMemory: true, // Creates database in memory instead of file
});
```
