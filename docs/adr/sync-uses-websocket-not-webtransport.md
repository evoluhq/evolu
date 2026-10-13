# Sync uses WebSocket, not WebTransport yet

- Date: 2026-10-13
- Status: Accepted

## Context

Clients sync with relays over one WebSocket per transport configuration, so
owners that use the same relay URL, such as the default one, share one
connection. WebTransport, now shipped in Chromium, Firefox, and Safari, could
avoid head-of-line blocking between owners on a shared connection and match
responses to requests with a stream per request.

WebKit, which Safari and other iOS browsers use, never returns QUIC
flow-control credit, so a connection stops receiving for good after about 16 MB
or 7,600 streams
([WebKit bug 319818](https://bugs.webkit.org/show_bug.cgi?id=319818)). A large
initial sync, or any long-lived connection, would hang without an error. The
protocol is still an IETF draft, and browsers speak different versions of it.
Node.js, which runs the relay, has no built-in WebTransport server; the
experimental `node:quic` has none. The `@fails-components/webtransport` addon
has no prebuilds for the relay's Alpine image and does not yet work with Safari
clients
([fails-components/webtransport#490](https://github.com/fails-components/webtransport/issues/490)).

## Decision

Sync uses WebSocket only. `OwnerTransport` stays a tagged type, so WebTransport
can be added later as another variant of it.

## Rejected alternatives

- WebTransport with WebSocket fallback: it would maintain a second transport
  for modest gains. WebSocket can never be removed, because browsers have no TCP
  fallback when a network blocks UDP, and React Native has no WebTransport.
- A server in another language beside the relay: another runtime to deploy and
  operate for the same modest gains.

## Consequences

Owners sharing a connection keep waiting for each other's large messages, and
completion is counted per owner and connection rather than matched per
request. A future WebTransport variant has to race WebSocket inside that
variant, not be added as a second `OwnerTransport`, or Evolu would sync
everything twice. Revisit when the WebKit fix ships in iOS and macOS, the
protocol becomes an RFC, and a WebTransport server works with the relay without
a second runtime.
