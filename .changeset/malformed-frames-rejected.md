---
"@evolu/common": patch
---

Rejected malformed sync messages that no Evolu peer sends

Sync decoded a message's ranges with no limit on their size or on the counts
the message declared, so one crafted message could make a relay or client
allocate hundreds of megabytes. Range upper bounds were not checked for order,
so decreasing bounds made the peer reply with `ProtocolSyncError` or skip
ranges silently. A request's unknown write key or subscription flag was read as
no write key and no subscription change. A relay also stored changes shorter
than any encrypted change, empty ones included, which its quota does not count,
so one request could add over 100 MB to its database under a 1 MB quota.

These messages are now rejected as `ProtocolInvalidDataError` before
reconciliation:

- A ranges section over 200,000 bytes, twice the largest
  `ProtocolMessageRangesMaxSize`, or a count of ranges or timestamps larger than
  the bytes after it.
- Range upper bounds that decrease. Equal bounds stay valid.
- A request whose write key flag is not 0 or 1, or whose subscription flag is
  not one of `SubscriptionFlags`.
- On a relay, a request with a change shorter than 41 bytes, the smallest
  `EncryptedDbChange`, before any of its changes is stored.

A request's flags are checked before anything is stored, but a message's ranges
are decoded after its changes are stored and, on a relay, broadcast.

A relay logs a rejected message and does not reply, and a client reports it on
the relay's sync route. Evolu clients and relays never send such messages, so
no migration is needed. A client still accepts a short change from a relay and
skips it in storage, because relays keep the short changes they stored before
this fix.
