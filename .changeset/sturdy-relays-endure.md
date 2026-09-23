---
"@evolu/nodejs": patch
"@evolu/relay": patch
---

Fixed relay crashes on rejected frames and during shutdown

A client that sent a frame the relay rejects, such as one larger than the
maximum protocol message size, crashed the relay process and disconnected every
client. The relay now closes only that connection and logs the error at debug
level.

A frame, or a connection attempt to a relay configured with `isOwnerAllowed`,
that arrived while the relay was shutting down, such as from a client syncing
during a deploy, crashed the process before shutdown finished. The relay now
ignores frames and refuses connections once shutdown starts.
