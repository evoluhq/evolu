---
"@evolu/common": patch
---

Stopped starting a sync round when a database registers an owner again

When a database that already syncs an owner registers it again, for example
from another instance, through a relay another database already uses for the
owner, it no longer starts a round through that relay. Every write of the
database already uploads through each relay claimed for the owner, whichever
instance made it, so the round reconciled nothing new. It only rechecked a route
that had skipped a change or failed, which `Evolu.requestSync`, a reconnect, or
a replacement database worker still do.
