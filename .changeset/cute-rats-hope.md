---
"@evolu/common": minor
---

Added WebSocketUrl and RelayUrl Types, which WebSocket transports now require

`WebSocketUrl` accepts a `ws:` or `wss:` URL, including its query, only in its canonical spelling, without a fragment or credentials, and in a form that React Native on Android can connect to. `RelayUrl` is a `WebSocketUrl` without a query, because `createOwnerWebSocketTransport` puts the OwnerId there. `WebSocketUrlFromString` and `RelayUrlFromString` convert other spellings, such as user input. All four validate with the platform's `URL`, as `Url` does, so React Native without Expo needs one that follows the WHATWG URL Standard, such as `whatwg-url-minimum` 0.2 or later, because React Native's own `URL` makes them reject every relay URL.

`createOwnerWebSocketTransport` now requires a `RelayUrl`, and the `url` of a WebSocket transport is a `WebSocketUrl`, so a malformed relay URL fails where the app creates it instead of never connecting. Equal relays are now equal strings, so `ws://localhost:4000` and `ws://localhost:4000/` no longer open two connections to one relay. A relay URL without a path ends with `/`, and so does its label in sync state, which is now a `RelayUrl`; the default relay is `wss://free.evoluhq.com/`. Transports are a local-first API, which isn't stable yet, so this ships in a minor version.

```ts
import {
  assertEqual,
  createOwnerWebSocketTransport,
  RelayUrlFromString,
  testAppOwner,
  WebSocketUrl,
  type OwnerTransport,
} from "@evolu/common";

const _before = [
  // @ts-expect-error A transport's url is a WebSocketUrl, not a string.
  { type: "WebSocket", url: "ws://localhost:4000" },
  createOwnerWebSocketTransport({
    // @ts-expect-error createOwnerWebSocketTransport takes a RelayUrl, not a string.
    url: "wss://relay.example.com",
    ownerId: testAppOwner.id,
  }),
] satisfies ReadonlyArray<OwnerTransport>;

const relayUrl = RelayUrlFromString.orThrow("WSS://Relay.Example.com");
const transports = [
  { type: "WebSocket", url: WebSocketUrl.orThrow("ws://localhost:4000/") },
  createOwnerWebSocketTransport({ url: relayUrl, ownerId: testAppOwner.id }),
] satisfies ReadonlyArray<OwnerTransport>;

assertEqual(
  transports[1].url,
  `wss://relay.example.com/?ownerId=${testAppOwner.id}`,
);
```
