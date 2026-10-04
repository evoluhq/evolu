---
"@evolu/common": patch
---

Fixed relay writes slowing down as an owner's changes grew

Before storing a batch, the relay checks which of its timestamps it already has.
SQLite ran that check over every timestamp the owner had stored, so at 20,000
stored changes it took 0.72 ms for a one-change write, and it grew with the
owner. It now looks up each incoming timestamp by primary key, which took
0.002 ms.
