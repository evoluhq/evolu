---
"@evolu/common": minor
---

Added a prefixed string codec

Use `prefixed(prefix)(Type)` to remove an exact, case-sensitive prefix when
decoding and restore it when encoding. The wrapped Type validates the suffix
and preserves its decoded output, including brands. Encoding uses its
canonical string representation.

```ts
import {
  assertEqual,
  assertErr,
  assertOk,
  assertType,
  ConstantCaseIdentifier,
  prefixed,
  PortFromString,
  type Port,
} from "@evolu/common";

const EnvName = prefixed("APP_")(ConstantCaseIdentifier);
const name = EnvName.fromUnknown("APP_PORT");
assertOk(name, "PORT");
assertType<typeof name.value, ConstantCaseIdentifier>();
assertEqual(EnvName.to(name.value), "APP_PORT");
assertErr(EnvName.fromUnknown("OTHER_PORT"));
assertErr(EnvName.fromUnknown("APP_port"));

const PortSetting = prefixed("port:")(PortFromString);
const port = PortSetting.fromUnknown("port:04000");
assertOk(port, 4000);
assertType<typeof port.value, Port>();
assertEqual(PortSetting.to(port.value), "port:4000");
```

The prefix must be a concrete string literal. The wrapped Type must accept a
string Input and encode to strings. An empty prefix leaves its representation
unchanged; an empty suffix is validated by the wrapped Type.
