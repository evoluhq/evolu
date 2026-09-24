---
"@evolu/common": minor
---

Added timestamp drift and ordering helpers

`isTimestampBeyondMaxDrift` checks whether timestamp milliseconds exceed the
configured drift limit relative to a supplied time.

`orderTimestamp` compares timestamps by milliseconds, counter, and node ID,
matching their encoded byte order without serialization. Distinct objects with
identical fields compare as equal.

```ts
import { assertEqual, assertFalse, assertTrue, Millis } from "@evolu/common";
import {
  createTimestamp,
  isTimestampBeyondMaxDrift,
  orderTimestamp,
} from "@evolu/common/local-first";

const now = Millis.orThrow(100);
const timestamp = createTimestamp({ millis: now });
const later = createTimestamp({ millis: Millis.orThrow(111) });
assertEqual(orderTimestamp(timestamp, later), -1);
assertEqual(orderTimestamp(timestamp, { ...timestamp }), 0);

const isBeyondMaxDrift = isTimestampBeyondMaxDrift({
  timestampConfig: { maxDrift: 10 },
});
assertFalse(isBeyondMaxDrift(Millis.orThrow(110), now));
assertTrue(isBeyondMaxDrift(later.millis, now));
```
