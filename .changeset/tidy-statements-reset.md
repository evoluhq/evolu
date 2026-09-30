---
"@evolu/web": patch
---

Fixed a failed SQLite statement breaking its later uses on the web

The web SQLite driver reuses prepared statements. When running one failed, for
example on a constraint violation or a full disk, the driver did not reset it,
so every later use of that statement failed with `SQLITE_MISUSE` until the page
reloaded. The statement is now reset after every run, so later queries and
writes that use it work.
