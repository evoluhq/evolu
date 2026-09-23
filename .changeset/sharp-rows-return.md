---
"@evolu/nodejs": patch
---

Fixed SQLite changes for writes with a returning clause

The better-sqlite3 driver reported zero `changes` for an insert, update, or
delete with a `returning` clause, because it treated every statement that
returns rows as a read. It now reports the number of rows the statement changed.
