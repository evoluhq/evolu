---
"@evolu/nodejs": minor
"@evolu/relay": minor
---

Added WebSocket pings to the relay

The relay pings every connection at `pingInterval`, thirty seconds by default,
and terminates a connection from which nothing has arrived since the previous
ping, so an idle dead path is detected within two intervals and NAT mappings
stay alive. Any incoming data counts, so an upload that delays a client's answer
on a slow link keeps its connection. A connection with data still queued in the
relay for it, such as a large reply on a slow link, is not pinged or terminated
until the operating system takes that data, because the answer waits behind it;
TCP ends such a connection if its path is dead. Data the operating system
already holds can still delay the answer past an interval, and the connection
then reconnects once after that data arrives. A connection is terminated instead
of queuing a broadcast that would leave more than 16 MB of broadcasts unsent to
it, whether its client stopped reading or reads more slowly than its owners'
traffic arrives, which bounds the relay's memory for it; the client reconciles
after it reconnects. Replies to a client's own requests do not count, because
their total follows its requests. Browsers answer pings automatically, so
clients need no change.

```ts
import { assertEqual } from "@evolu/common";
import type { NodeJsRelayConfig } from "@evolu/nodejs";

// Detects a dead connection within about twenty seconds instead of a minute.
const config: Pick<NodeJsRelayConfig, "pingInterval"> = {
  pingInterval: "10s",
};
assertEqual(config, { pingInterval: "10s" });
```
