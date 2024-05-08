---
"@evolu/common": minor
---

Time Travel

Evolu does not delete data; it only marks them as deleted. This is because local-first is a distributed system. There is no central authority (if there is, it's not local-first). Imagine you delete data on some disconnected device and update it on another. Should we throw away changes? Such a deletion would require additional logic to enforce data deletion on all devices forever, even in the future, when some outdated device syncs. It's possible (and planned for Evolu), but it's not trivial because every device has to track data to be rejected without knowing the data itself (for security reasons).

Not deleting data allows Evolu to provide a time-traveling feature. All data, even "deleted" or overridden, are stored in the evolu_message table. Here is how we can read such data.

```ts
const todoTitleHistory = (id: TodoId) =>
  evolu.createQuery((db) =>
    db
      .selectFrom("evolu_message")
      .select("value")
      .where("table", "==", "todo")
      .where("row", "==", id)
      .where("column", "==", "title")
      .$narrowType<{ value: TodoTable["title"] }>()
      .orderBy("timestamp", "desc"),
  );
```

Note that this API is not 100% typed, but it's not an issue because Evolu Schema shall be append-only. Once an app is released, we shall not change Schema names and types. We can only add new tables and columns because there is a chance current Schema is already used.
