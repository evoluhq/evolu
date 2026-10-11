---
"@evolu/web": patch
---

Stopped a crashed shared worker from handling later messages

A panic of Evolu's shared worker closed it only after its cleanup, which can
wait for a database that is still opening. Until then, creating an Evolu
instance made the worker throw "Cannot use a disposed object.", which replaced
the panic's error in every tab's `evoluError`, and a tab opened meanwhile
connected to the failed worker. The worker now closes as soon as it panics, so
it drops later messages.
