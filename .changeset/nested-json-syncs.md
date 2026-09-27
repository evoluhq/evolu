---
"@evolu/common": patch
---

Fixed deeply nested JSON text stopping a database

A string value that parses as JSON nested more than 1,000 levels deep, which
takes only 2,002 characters such as `[[[…]]]`, made encoding its change for sync
throw. The mutation was saved, but the error stopped the database: its later
queries, writes, and sync never completed, and every sync round failed on the
same change. Such a value is now encoded as a plain string, so it syncs, and a
change already stored syncs on the next round.
