---
"@evolu/react-native": patch
---

Opened each in-memory Expo database on its own connection

expo-sqlite reuses an open connection with the same path and options, and every
in-memory database has the path `:memory:`. So in an Expo app, Evolu databases
created with `memoryOnly` and open at the same time shared one SQLite database,
also with any `:memory:` database the app opened with default options, and each
saw the others' tables and data. Each in-memory database now opens its own
connection.
