---
"@evolu/common": patch
---

Add the sync function

Evolu syncs on every mutation, tab focus, and network reconnect, so it's generally not required to sync manually, but if you need it, you can do it.

```ts
evolu.sync();
```
