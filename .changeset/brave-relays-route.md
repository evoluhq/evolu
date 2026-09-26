---
"@evolu/common": patch
---

Fixed synchronization routing across relays and databases

A relay's response now continues only with that relay, and a round started by
a socket opening or by a transport's first use goes only through that
transport. Previously every such message was sent to all of the owner's
relays. Owner messages received from one relay are now reconciled with the
owner's other relays in the same session, instead of waiting for a reconnect. A
database's first writable owner registration also reconciles its
existing history through connections already claimed by other databases. A
database using another already claimed connection starts its own reconciliation.
Explicit `requestSync` calls and mutation uploads still reach every open
transport. After a leader replacement, the owner's relays are reconciled again,
because a response reporting stored messages may have been lost.
