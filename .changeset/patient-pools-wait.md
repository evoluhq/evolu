---
"@evolu/web": patch
---

Fixed losing or failing to open a database right after the tab hosting it closed

When the tab hosting a database closed or crashed, the browser could hand the
database to another tab before it released the database files; Safari
releases them in no set order. Opening the database there failed, and
SQLite's cleanup after the failure tried to delete the database directory. The
still-open files usually prevented that, but a file released in between let it
delete the device's local data. Evolu now waits
until every database file can be opened before it opens the database, and
logs a warning when the wait lasts longer than five seconds.
