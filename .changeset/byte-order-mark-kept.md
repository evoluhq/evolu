---
"@evolu/common": patch
---

Fixed synced strings losing a leading byte order mark

A string value, table name, or column name that started with U+FEFF reached
other devices without it, so they stored a different value than the device
that wrote it. This happened, for example, with the first field of a CSV file
read with its byte order mark. `decodeString` now keeps a leading U+FEFF.
Devices on `@evolu/common` 8.17 and earlier still drop it from the strings they
receive.
