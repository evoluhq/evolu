---
"@evolu/common": patch
---

Shrank the database file when an owner or local-only rows are deleted

A database file never shrank. SQLite keeps the storage that `evolu.deleteOwner` or a deletion of local-only rows frees, and reuses it for later writes, so the file stayed at its largest size. That wastes storage in browsers and on phones, where it is scarce.

Such a deletion now gives the pages it emptied back to the device when it commits. Chromium counts them against the origin's quota until the tab that runs the database closes. Synced tables use soft deletes, which keep their rows as before. Nothing changes in the API.

A database an earlier release created is rewritten once, at its first start with this release, unless its data takes more than 100 MiB; that one is rewritten at a later start, once deletions bring it under. The app waits for the rewrite, and on React Native it does not respond meanwhile. It takes about 2 seconds for 30 MiB in a browser on a recent laptop, and it needs about the size of the data in free storage and in memory, which a browser keeps until that tab closes. If it fails, such as on a full disk, the database works as before, and the next start tries again. The Evolu Relay's database is unchanged.
