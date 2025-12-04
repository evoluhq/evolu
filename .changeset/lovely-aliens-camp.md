---
"@evolu/common": minor
---

Added `createObjectURL` helper for safe, disposable `URL.createObjectURL` usage using JS Resource Management so the URL is disposed automatically when the scope ends.

Example:

```ts
const handleDownloadDatabaseClick = () => {
  void evolu.exportDatabase().then((data) => {
    using objectUrl = createObjectURL(
      new Blob([data], { type: "application/x-sqlite3" }),
    );

    const link = document.createElement("a");
    link.href = objectUrl.url;
    link.download = `${evolu.name}.sqlite3`;
    link.click();
  });
};
```
