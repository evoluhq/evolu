---
"@evolu/common": patch
---

Sped up mutations and received sync batches that change many rows

Changing one column on 10,000 rows of an encrypted database with 327,000
history rows took about 6 seconds in Chromium and WebKit, because the batch
read thousands of database pages it didn't need, and the web decrypts every
page it reads. Evolu now applies a batch in the order of its history index and
derives `createdAt` and `updatedAt` from the changes' timestamps alone, so the
same batch takes about 2.5 seconds on an Apple silicon Mac. Stored data and
query results are unchanged.
