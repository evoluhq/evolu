---
"@evolu/common": patch
---

Fixed synchronization routing across relays and databases

A relay's response now continues only with that relay, and a round started by
a socket opening or by a transport's first use goes only through that
transport. Previously every such message was sent to all of the owner's
relays. Owner messages received from one relay are now reconciled with the
owner's other relays in the same session, instead of waiting for a reconnect or
`requestSync`. A database's first writable owner registration also reconciles its
existing history through connections already claimed by other databases. A
database using another already claimed connection starts its own reconciliation.
Explicit `requestSync` calls and mutation uploads still reach every open
transport. A request is absorbed by a queued round with the same owners and a
covering target that reads all previously queued writes. Propagation requests
can reuse a queued round with the same owners and a covering target regardless
of later queued writes because their messages are already stored. After a leader
replacement, the owner's relays are reconciled again, because a response
reporting stored messages may have been lost.

Disposing an Evolu instance that used one owner through several transport sets
now releases every set instead of failing on the second one.
