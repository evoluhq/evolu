---
"@evolu/common": minor
---

Replaced relay connections that die without closing, after a system sleep or two minutes of silence

A relay connection can die without a close event, after a system sleep, a network change, or a proxy that drops it. The WebSocket API answers the relay's pings without telling JavaScript, in browsers, React Native and Node alike, so an app kept reading `Synced` while changes from other devices stopped arriving, until it sent something itself.

The shared worker now replaces such a connection and reconnects:

- After a system sleep of five seconds or more, at its next check, within about thirty seconds of waking. This works with every relay, wherever `performance.now()` stops during sleep: in WebKit, Chromium and Firefox on Apple platforms, including WebViews such as Tauri's on macOS, in Chromium and Firefox on Linux and Android, and in React Native.
- After two minutes plus up to thirty seconds of jitter without any frame, while no request is outstanding on the connection, on a relay that sends heartbeats: `@evolu/nodejs` 4.6.0 or `@evolu/relay` 4.3.0 and later. This also covers a connection that dies while the device is awake, and a sleep on Windows. Upgrade your relay to get it.

`relayHeartbeatInterval` is the thirty-second interval of that heartbeat, which the `OwnerWebSocketTransport` documentation describes for anyone writing a relay.

```ts
import { assertSame, relayHeartbeatInterval } from "@evolu/common";

// A relay sends an empty text frame at least this often to an idle connection.
assertSame(relayHeartbeatInterval, 30_000);
```
