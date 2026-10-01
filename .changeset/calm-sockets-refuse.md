---
"@evolu/common": minor
---

Reported a WebSocket the platform refuses to create instead of panicking

When the platform's WebSocket constructor threw, for example for a URL with a
fragment, a `ws:` URL on an `https:` page, or a Content Security Policy that
blocks the URL, the throw panicked the Run that created the WebSocket. In
Evolu's shared worker, that stopped sync for every tab. `createWebSocket` now
reports it to `onError` as the new `WebSocketCreateError`, holding the thrown
value, and stops connecting, because such a URL fails the same way on every
attempt. In Evolu, the relay shows a `WebSocketCreateError` as its connection
error in sync state, and other relays keep syncing.

`WebSocketError` has a new member, so code that switches exhaustively over
`WebSocketError["type"]` needs a case for `WebSocketCreateError`.
