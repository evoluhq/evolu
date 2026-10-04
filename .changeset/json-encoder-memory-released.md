---
"@evolu/common": patch
---

Released the memory kept after encoding a large JSON value

`encodeJsonValue` encodes into a module-level scratch array that only grew, and
it reserves 3 bytes per UTF-16 code unit of a string. `encodeSqliteValue` also
kept a module-level buffer for JSON values. After a mutation with a JSON string
near `maxMutationSize`, about 2.5 MB stayed allocated on the main thread and in
the worker until they ended. A mutation rejected for exceeding the limit left
more on the main thread, 12 MB for a 3,000,000-character string. The scratch
array now returns to its initial size after a value grows it past 1 MiB, and
`encodeSqliteValue` no longer keeps a buffer.
