---
"@evolu/common": patch
---

Stamped changes with a new NodeId per session, so a copied database no longer loses changes

Every timestamp carries a NodeId, which used to be generated when the database was created and stored in it. A database copied to another device, as when a phone backup is restored to a new phone while the old one stays in use, kept that NodeId, so both copies could stamp different changes with identical timestamps. One of the changes was then lost on relays and other devices, and nothing reported it.

The SharedWorker now generates a NodeId each time it starts using a database and stamps every change with it, so a copy writes under its own NodeId from its first change. Relays see a new NodeId per session instead of one per database, and so do apps that read timestamps from `evolu_history`: a NodeId no longer identifies the device or database that made a change. Existing databases need no migration, and changes a copy already lost stay lost.
