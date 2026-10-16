---
"@evolu/common": patch
---

Stopped encrypting the upload of a write made while every relay socket is closed

The SharedWorker encrypted each synced write for upload even when none of its owner's relay sockets was open, although it sends uploads only through open sockets and keeps none for a closed one. The round that a socket starts when it opens reads the write from the database and encrypts it then, so encrypting it while offline was wasted. The upload is now encrypted only while one of the owner's sockets is open.
