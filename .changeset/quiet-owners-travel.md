---
"@evolu/common": patch
---

Stopped copying the AppOwner mnemonic into workers

`useOwner` posted the owner object it received to the shared worker, which
passed it on to the database worker. For an `AppOwner`, including the one Evolu
uses automatically when transports are configured, that copied its mnemonic
into both workers, which never read it. `useOwner` now posts only the owner's
id, encryption key, and write key.
