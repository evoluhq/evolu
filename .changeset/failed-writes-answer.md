---
"@evolu/common": patch
---

Reported a mutation that could not be stored instead of stalling its database

When SQLite failed to store a mutation, for example because the disk was full,
the database worker never answered it. Every later query, mutation, and export
of that database then waited in every tab until the tab running the database
worker closed, and `evoluError` reported nothing. Now the mutation rolls back
as before and later requests run. The tab that made it gets an `UnknownError`
in `evoluError`, or every tab does when its Evolu instance was disposed first.

The mutation is not saved, and neither are the other mutations in its batch,
usually those made in the same synchronous block, because they are stored in
one transaction. Their `onComplete` callbacks do not run.
