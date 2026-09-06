---
"@evolu/nodejs": major
---

Required validated Port values in relay configuration

`NodeJsRelayConfig.port` remains optional, but a supplied value must now be a
validated `Port` instead of a plain number. This ensures ports are integers
from 0 through 65535 before starting the server. Zero requests an automatically
assigned listening port.

Use `Port.orThrow` for startup constants or handle the Result from
`Port.fromUnknown` or `PortFromString.fromUnknown` for external input.

```ts
import { assertType, Port, type Task } from "@evolu/common";
import type { Relay } from "@evolu/common/local-first";
import { createRelay, type RelayDeps } from "@evolu/nodejs";

// @ts-expect-error Relay configuration requires a validated Port, not a number.
const _old = createRelay({ port: 4000, isOwnerWithinQuota: () => true });

const main = createRelay({
  port: Port.orThrow(4000),
  isOwnerWithinQuota: () => true,
});
assertType<typeof main, Task<Relay, never, RelayDeps>>();

const defaultPort = createRelay({ isOwnerWithinQuota: () => true });
assertType<typeof defaultPort, Task<Relay, never, RelayDeps>>();
```
