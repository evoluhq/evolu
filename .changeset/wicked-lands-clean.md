---
"@evolu/sqlite-wasm": patch
---

Fixed a failed open of the OPFS pool changing other slots

Opening the pool when reading a slot's header throws or returns fewer bytes than
the slot holds now changes no slot. It read and cleaned up the slots one at a
time, so it could already have freed or truncated the slots listed before that
one, as the next open that succeeds would. The release notes of 3.54.1-build1
said such a short read changes nothing.
