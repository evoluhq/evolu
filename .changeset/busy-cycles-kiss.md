---
"@evolu/react-native": patch
---

Fixed the React Native binding keeping a database open or an export unwiped when an allocation failed

When an allocation failed right after a database opened, the connection stayed open with nothing to close it, so its file stayed held until the app restarted and every later open of it failed after waiting 10 seconds. When one failed right after an export, the export's plaintext copy of the database stayed in memory without being wiped. The binding now does what can fail, giving the database's handle its state and making room to record the connection, before it opens a database, and an export's bytes have their owner, which wipes and frees them, before anything can fail, as in `@evolu/nodejs`'s binding.
