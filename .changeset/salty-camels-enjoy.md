---
"@evolu/common": patch
---

Sped up loading several queries at once on encrypted databases

The database worker ran each query of a request in a read transaction of its own. Whenever one starts, SQLite rereads the database's change counter, which Evolu's encryption, on the web and now on React Native, serves by reading and decrypting the database's first page, so every query decrypted that page again. The queries Evolu loads together now share one read transaction: those an app loads at once, and the subscribed queries Evolu reloads after sync or another tab changes data.

In Chromium, Firefox and WebKit, a request of 20 small queries on an encrypted web database took 0.2–0.3 ms instead of 1.5–2.5 ms, and 1.6–2.2 ms instead of 6.0–8.5 ms after 50 ms of idle. A request of one query, which gains nothing, takes up to 0.08 ms longer after idle, for beginning and ending the transaction. Unencrypted databases save less. A query that fails still fails only itself.
