---
"@evolu/common": patch
---

Released leader locks granted after their wait ended

Web Locks grant a request before they run its callback, and an abort after the grant doesn't cancel it. `acquireLeaderLock` then kept a lock granted after its Task was aborted, and `acquireLeaderLockCallback` kept one granted after its handle was disposed and still called its callback. The lock stayed held until the page or worker ended, so every later request for its name waited. Both now release such a lock at once. Racing `acquireLeaderLock`, as `timeout` does, can still lose a lock granted as the deadline wins; to bound the wait, dispose the handle of `acquireLeaderLockCallback`.
