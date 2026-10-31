---
"@evolu/common": patch
---

Fixed app indexes named like SQLite's or Evolu's failing the next start

An app index whose name began with `sqlite` or `evolu` and any next character, such as `sqlitesByDate` or `evolutionByDate`, was left out when Evolu read the database's indexes, so the next start created it again and failed with "index already exists". Evolu now compares the `sqlite_` and `evolu_` prefixes literally. Index names starting with `evolu_` are reserved for Evolu's own indexes, and `createEvolu` now rejects them.
