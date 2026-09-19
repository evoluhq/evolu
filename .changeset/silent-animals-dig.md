---
"@evolu/common": patch
---

Fixed writable owner registrations

Readonly and writable registrations for the same owner now retain their own capabilities and transport leases. Adding writable access starts synchronization even when readonly access already exists; removing the last writable registration stops synchronization while any readonly registrations keep their connections.
