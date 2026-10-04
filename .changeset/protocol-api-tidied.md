---
"@evolu/common": minor
---

Exported the `ProtocolErrorCode` type and tidied the protocol API

`ProtocolErrorCode` was exported only as a value, although
`createProtocolMessageBuffer` takes the type in its options. The type of a
protocol header's error code is now exported with the same name.

The properties of `ApplyProtocolMessageAsClientOptions` and
`ApplyProtocolMessageAsRelayOptions` are now readonly. Create new options
instead of assigning to existing ones.

`decodeProtocolMessageToJson` was removed. It was a stub that always threw.

```ts
import { assertEqual, assertType } from "@evolu/common";
import {
  defaultProtocolMessageRangesMaxSize,
  ProtocolErrorCode,
  type ApplyProtocolMessageAsClientOptions,
} from "@evolu/common/local-first";
// @ts-expect-error decodeProtocolMessageToJson is no longer exported.
import type { decodeProtocolMessageToJson as _decodeProtocolMessageToJson } from "@evolu/common/local-first";

const code: ProtocolErrorCode = ProtocolErrorCode.QuotaError;
assertType<ProtocolErrorCode, 0 | 1 | 2 | 3 | 4>();
assertEqual(code, 3);

const options: ApplyProtocolMessageAsClientOptions = {};
// @ts-expect-error Cannot assign to 'rangesMaxSize' because it is a read-only property.
options.rangesMaxSize = defaultProtocolMessageRangesMaxSize;

const withRangesMaxSize: ApplyProtocolMessageAsClientOptions = {
  ...options,
  rangesMaxSize: defaultProtocolMessageRangesMaxSize,
};
assertEqual(withRangesMaxSize.rangesMaxSize, 30_000);
```
