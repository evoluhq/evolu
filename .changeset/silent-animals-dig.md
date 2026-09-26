---
"@evolu/common": patch
---

Fixed registrations of one owner with different access or transports

Readonly and writable registrations for the same owner now retain their own capabilities and transport leases. Adding writable access starts synchronization even when readonly access already exists; removing the last writable registration stops synchronization while any readonly registrations keep their connections. Disposing an Evolu instance that used one owner through several transport sets now releases every set instead of failing on the second one.
