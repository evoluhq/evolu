---
"@evolu/common": minor
---

Reconnected WebSocket connections that stop answering

A connection can stay open while nothing reaches the other end: no close or
error event arrives, so the WebSocket's own retry never runs and sync stalls
indefinitely. The shared worker now reconnects a socket when a request for an
owner has been outstanding for ninety seconds with no Response for that owner
received since, long enough for a 1 MB request or reply to arrive at about 90
kbit/s. Each timeout doubles the connection's timeout for every request on it,
also after reconnecting, up to twenty-four minutes, so downloading a large
history over an even slower link still finishes. The timeout belongs to the
connection because a reply for one owner can wait behind another owner's large
frame on it. A grown timeout lasts while a request is outstanding on the
connection or a database synchronizing through it is not yet reconciled with the
relay, because the small replies that start a recovery arrive quickly even on a
link too slow for the large frame after them. The connection is abandoned
without waiting for its closing handshake and a new one starts with a fresh
retry schedule; the transport reports that moment as its close time, because the
socket reports no close for it. The timeout is measured on a monotonic clock, so
a system clock adjustment cannot make a request look timed out or keep one from
being recognized. Transport close and error events are logged at debug level.

`WebSocket` gained `reconnect` for that, which callers use when they know the
connection is dead although it never closed. Reconnecting drops the connection
without waiting for a close handshake, consults neither `onClose` nor
`shouldRetryOnClose`, and does nothing after disposal, on a connection that is
already closing or closed, or while the wrapper is waiting to retry. A
connection that was open restarts the retry schedule; one that never opened
keeps its backoff, having proved nothing.

`reconnect` is a required member of `WebSocket`, so an implementation of
`CreateWebSocket` other than `createWebSocket`, such as a test double or a
custom transport, must add it. It settles the abandoned connection with the new
`WebSocketReconnectError`, which widens `WebSocketRetryError`: a `shouldRetry`
or `schedule` that switches exhaustively over that union must handle it.
Reconnecting carries no close event, because nothing observed one to report.

`testCreateWebSocket` gained `close`, which closes the newest socket for a URL
and reports a close event with code 1006 unless given other fields, `error`,
which reports a WebSocket error, and `reconnect`, with `reconnectedUrls`
recording the URLs it was called for. A URL can be created again after its
socket was disposed; each socket keeps its own state and the helpers address the
newest one.

Its sockets also report `connecting`, which they previously could not.
`createWebSocket` reports `connecting` before a socket opens and for as long as
it retries after a close, and reaches `closed` only when disposed; the double
reported `closed` for all of that, so a test could assert a state the real
wrapper never produces. Sockets still start `open` by default;
`{ isOpen: false }` now starts them `connecting`. A socket returns to
`connecting` after `reconnect`, and after `close` stays `closed` for whatever
the `onClose` handler schedules before becoming `connecting` again, matching
when `createWebSocket` drops the closed socket. Assertions that expected
`closed` in those places expect `connecting` now.
