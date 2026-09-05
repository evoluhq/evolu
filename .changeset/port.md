---
"@evolu/common": minor
---

Added Port and PortFromString

Added `Port` for integer ports from 0 through 65535 and `PortFromString` for
decimal text. Zero remains valid for requesting an automatically assigned
listening port. `PortFromString` uses the same decimal syntax as
`IntFromString` and returns a validated `Port`.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertType,
  Port,
  PortFromString,
} from "@evolu/common";

const port = Port.orThrow(4000);
assertType<typeof port, Port>();
assertErr(Port.fromUnknown(4000.5));

assertOk(PortFromString.fromUnknown("0"), 0);
assertOk(PortFromString.fromUnknown("65535"), 65535);
assertErr(PortFromString.fromUnknown("-1"));
assertErr(PortFromString.fromUnknown("65536"));
assertEqual(PortFromString.to(port), "4000");
```
