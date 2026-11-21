---
"@evolu/common": patch
---

Measured and synced changes as SQLite stores them

SQLite stores -0 as 0 and a lone surrogate as U+FFFD, but `evolu.getMutationSize`, the `maxMutationSize` check, and the upload of a write while connected used the change as written. Text with a lone surrogate that is JSON once stored can encode much larger, so a mutation within the limit could be too large for any protocol message as stored and never sync from the history. Changes are now always encoded as SQLite stores them, so such a mutation throws like any other over the limit.
