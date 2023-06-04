---
"evolu": minor
---

New evolu.world sync&backup server and new useSyncState React Hook

A lot of time was spent considering the ideal Evolu sync&backup server architecture. While the evolu-server package is okay, it's sure that one server can't scale for global usage. Evolu is going to be used with SatoshiLabs Trezor, a hardware Bitcoin wallet, and they have already sold over 1 million devices. It's clear Evolu needs something that scales. And as the domain suggests, there should be no regions, only one global endpoint. We initially designed a network of many replicated SQLite nodes spread worldwide, then realized that's exactly what Cloudflare is working on. That's why the new evolu.world sync&backup server is built on top of Cloudflare D1. Note that evolu.world is beta, just like Cloudflare D1 is.

The new evolu.world sync&backup server is free for anyone but restricts the size of user data to 1 MB. It's not a final decision, just a number to start with. The idea is to provide syncing for free to anyone with up to 1 MB of data and make money on backups. Because of the unique account-less Evolu design, it's easy to attack the service but also easy for Evolu to protect itself. Suspicious accounts can be deleted anytime without losing user data, they are still stored locally on devices, and syncing will still work if we accidentally delete a real user.

To monitor the sync state, Evolu provides a new useSyncState React Hook.
