---
"@evolu/common": patch
---

Kept the decrypted values of an invalid received change out of its error

A received change that decrypted but failed validation, for example because it
set a reserved system column, caused a `ProtocolInvalidDataError` whose cause
held the change's decrypted values. The error reached the route's sync state in
every tab, where an app may log or report it. It now says only
`Invalid DbChange`. Only a writer that holds the owner's encryption key can send
such a change.
