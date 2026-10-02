---
"@evolu/common": minor
---

Fixed web workers ignoring the app's console level

The database worker and each app's console in the SharedWorker logged at the
default `log` level, whatever level the app's console had. A web app at `debug`
never saw its database's sync logs, such as `requestSync` and
`sendProtocolMessage`, an app at `trace` never saw SQL logs, and an app at
`silent` still printed messages such as `leaderAcquired`. Each database worker
and each app's SharedWorker console now use the level of the app that started
them, and the rest of the SharedWorker uses the level of the tab that hosts its
database workers.

`Console.write` now drops entries below the console's level, so a tab prints the
entries its workers forward only at its own level. The database worker of a
`silent` app forwards errors, so unexpected failures set `evoluError`. On React
Native, where workers already used the app's level, such failures of a `silent`
app were lost and now set `evoluError`.
