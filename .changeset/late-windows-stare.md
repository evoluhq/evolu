---
"@evolu/web": patch
"@evolu/react-native": patch
---

Made sync and writes faster on encrypted databases

Before each transaction, SQLite rereads the database's first page to check that no other connection changed the file, and Evolu's encryption had to decrypt that whole page each time. Queries already share one transaction per batch, but sync runs most of its reads on their own: reconciling 20,000 rows split between a device and the relay, interleaved in time, takes about 12,000 of them. An encrypted database now holds its lock from open to close, in SQLite's exclusive locking mode, so SQLite skips that check. No other tab, worker or connection of the app could open the database meanwhile anyway.

Medians on an M-series Mac. The native column runs the C core React Native ships, in Node.js, not on a phone. The sync row is an estimate: the time each read saves times the reads sync runs on its own.

|                                                                 | Chromium     | WebKit       | Firefox      | Native core    |
| --------------------------------------------------------------- | ------------ | ------------ | ------------ | -------------- |
| 10,000 one-row reads, each in its own transaction, as sync runs | 674 → 6 ms   | 882 → 7 ms   | 1,162 → 8 ms | 70 → 3 ms      |
| Sync of 20,000 interleaved rows, time saved                     | about 0.8 s  | about 1.1 s  | about 1.4 s  | about 0.08 s   |
| Commit of a one-row update                                      | 3.1 → 1.2 ms | 1.0 → 0.5 ms | 1.3 → 0.7 ms | 0.20 → 0.08 ms |

While the database is open, its rollback journal stays between transactions, emptied after each commit.
