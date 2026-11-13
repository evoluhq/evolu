---
"@evolu/common": patch
---

Made deleteDatabase delete a database that doesn't open

An app whose local database doesn't open, such as a corrupt one or one that a newer version of the app wrote, often has to delete it and start over, but `deleteDatabase` of such a database stayed pending until the instance was disposed. It now deletes the database's files by name, without opening them, and resolves once they are gone, as for any database. A deletion that doesn't finish in time, such as while the tab that starts it shows a modal dialog, fails with `DatabaseHeldError`. After a failure, the database may be partly or wholly deleted, and its instances keep working.
