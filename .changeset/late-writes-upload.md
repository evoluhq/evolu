---
"@evolu/common": patch
---

Uploaded writes through the database's owner registrations

A mutation was uploaded only through the writing Evolu instance's own writable
registrations. A write from an instance that had not registered the owner as
writable, or one that its database worker answered after the instance was
disposed, was committed locally but reached the relays and the other databases
using the owner only with the next synchronization round. Such a write is now
uploaded as soon as the database worker answers it, through any writable
registration of the owner in the same database. A write answered after its
instance was disposed also refreshes the queries of the database's other
instances.
