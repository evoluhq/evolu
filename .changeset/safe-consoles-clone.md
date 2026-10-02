---
"@evolu/common": minor
---

Fixed logging a value that cannot be cloned in a worker throwing

Workers post each console entry to tabs, and a browser throws a
`DataCloneError` for a value it cannot clone, such as an object holding a
function. The error reached the code that logged the value. Both workers now
post entries with the new `postConsoleEntry`, which replaces such an `Error`
with the plain object `createUnknownError` makes of it, and any other such value
with a string.

`testCreateBroadcastChannel` now structured-clones each message like a native
channel, so a test that posts a value that cannot be cloned fails as it would
in a browser.
