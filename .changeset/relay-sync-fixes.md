---
"@evolu/relay": patch
---

Fixed relay crashes and failing syncs with `@evolu/common` 8.18.0

Update relays to this version. With it, the relay:

- Keeps running when SQLite fails to store a write, such as on a full disk, and
  answers with `ProtocolWriteError`. Before, the failure crashed the relay, and
  a supervisor restarting it crashed again on the next write.
- Answers syncs whose reply nearly fills a message. Before, such a reply failed
  the same way on every retry, so the owner stopped syncing through the relay.
- Skips a stored change too large for any message, and logs it with
  `console.warn`, instead of asking for it in every round without end.
- Rejects malformed requests before storing, subscribing, or broadcasting
  anything, such as changes shorter than any encrypted change, which its quota
  did not count.
- Looks up each incoming timestamp by primary key, so writes no longer slow down
  as an owner's changes grow.

See the `@evolu/common` 8.18.0 release notes for details.
