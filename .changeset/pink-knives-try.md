---
"@evolu/common": patch
---

Stopped encrypting a second copy of each synced write for open databases that drop it

A relay doesn't send an upload back to the socket it came from, so the SharedWorker also delivers a copy of each synced write to the other databases open in it. It encrypted that copy whenever more than one database was open, although a database drops it unless one of its Evolu instances uses the owner with write access. An app that kept a second database open, such as a local-only one for device data, thus encrypted every synced write a second time for nothing. The copy is now encrypted only when another open database uses the owner with write access.
