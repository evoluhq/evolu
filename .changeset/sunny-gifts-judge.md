---
"@evolu/common": patch
"@evolu/react-native": patch
---

Stopped Evolu's in-memory workers from waiting for frames on React Native

On React Native, Evolu runs its database worker and shared worker in memory on the JavaScript thread, and the in-memory workers delivered messages with `setTimeout(0)`. React Native fires such a timer only at the next frame or a later one, and every Evolu operation passes several messages between the app and the workers, so it took whole frames however fast SQLite was: at 60 Hz, about 67 ms for a mutation and over 100 ms to start Evolu.

Where React Native's runtime scheduler exists, which the New Architecture installs, the in-memory workers now deliver messages in tasks of that scheduler, which React also schedules its work with. Each delivery is still a task of its own, so input and rendering can still come between deliveries, but none waits for a frame. Elsewhere, the in-memory workers still use `setTimeout(0)`.

In the iOS simulator, a mutation took 1.5 ms instead of 66.7 ms, 100 mutations 10.7 ms instead of 66.3 ms, exporting the database 8.2 ms instead of 66.2 ms, and starting Evolu on a new database 2.3 ms instead of 120 ms. On an Android phone, the Payky app, which patched Evolu the same way, measured a query taking 1–2 ms instead of about 55 ms, and its first screen 352–368 ms instead of 574–711 ms.
