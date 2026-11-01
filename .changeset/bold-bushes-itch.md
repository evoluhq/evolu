---
"@evolu/nodejs": minor
"@evolu/relay": minor
---

Sent an empty text frame with each relay ping, so clients notice connections that die without closing

The WebSocket API answers pings without telling JavaScript, in browsers, React Native and Node alike, so a client could not tell a connection that died silently from an idle one. The relay now sends an empty text frame as each connection's first frame and right after each ping, which clients from `@evolu/common` 8.26.0 watch; older clients ignore it. A proxy in front of the relay must allow more than thirty seconds of idle time, as it already had to for the pings.

`pingInterval` of `createRelay` must now be at most thirty seconds, `relayHeartbeatInterval`, and a longer one panics before the relay opens its database.
