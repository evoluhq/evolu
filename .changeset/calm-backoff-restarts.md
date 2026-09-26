---
"@evolu/common": minor
---

Restarted WebSocket reconnect backoff after a healthy connection

`createWebSocket` builds its retry schedule once, and a connection settles only
when it closes, so backoff accumulated across every disconnect for the lifetime
of the socket and never returned to the base delay. With the default schedule a
client that had disconnected around nine times waited up to thirty seconds
before every later reconnect, however long it had been connected in between.

A connection that stays open for thirty seconds, the delay cap of
`webSocketReconnectSchedule`, now starts the schedule over, because it outlasted
the longest delay that schedule can produce. Shorter connections reset nothing,
so an endpoint that accepts and immediately drops connections still backs off.
The new `healthyConnectionDuration` option sets that threshold, for a custom
`schedule` whose delay cap is not thirty seconds; choose it with the schedule,
since it is the schedule's cap and only the schedule knows it.

The threshold is measured on a monotonic clock, so a system clock adjustment
cannot make a connection look healthy or keep a healthy one from being
recognized.

```ts
import {
  assertEqual,
  exponential,
  jitter,
  maxDelay,
  type WebSocketOptions,
} from "@evolu/common";

// A schedule capped at one minute restarts after a one-minute connection.
const options: WebSocketOptions = {
  schedule: jitter("100%")(maxDelay("1m")(exponential("100ms"))),
  healthyConnectionDuration: "1m",
};
assertEqual(options.healthyConnectionDuration, "1m");
```
