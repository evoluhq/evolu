---
"@evolu/web": patch
---

Fixed opening a database right after the tab hosting it closed

When the tab hosting a database closed or crashed, the browser could hand the
database to another tab before it released the database files; Safari
releases them in no set order. Opening the database there failed, and
SQLite's cleanup after the failure tried to delete the database directory,
which the still-open files usually but not always prevented. Evolu now waits
until every database file can be opened before it opens the database, and
logs a warning when the wait lasts longer than five seconds.
