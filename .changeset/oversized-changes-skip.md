---
"@evolu/common": minor
---

Fixed sync looping forever on a stored change too large for any message

Clients up to 8.11 could save a change that encrypts to more than one protocol
message can hold, such as a row with a 999,377-byte blob. Sync then asked for
that change in every round without end. Mutations made online were still
uploaded through that relay, but changes that need a sync round, such as those
made offline, never were. A change crafted on a relay with the owner's write
key made the relay loop the same way. Sync now skips a stored change that
cannot fit an empty message after a pending Skip range, which is the message a
later round is guaranteed to reach. Changes within `maxMutationSize` always
fit. An answer to a Timestamps range neither sends nor lists a skipped change.
A request or a split still lists its timestamp, so a peer that lacks it may ask
for it once per sync and gets an answer without it, so every sync ends. A
skipped change stays where it is stored and is not recovered.

A client records the skipped change on the relay's route as its `skippedError`,
the new `ProtocolChangeTooLargeError` with the change's timestamp and encrypted
size, so the owner's sync status shows the error. A relay logs it with
`console.warn` once it updates `@evolu/common`. `applyProtocolMessageAsClient`
passes it to the new `onChangeTooLarge` option, or logs it with `console.warn`
without one. Code that switches over the `type` of a `SyncRouteError` needs a
case for it.

```ts
import { assertEqual, Millis, PositiveInt } from "@evolu/common";
import {
  createTimestamp,
  type ProtocolChangeTooLargeError,
  type SyncRouteError,
} from "@evolu/common/local-first";

const tooLarge: ProtocolChangeTooLargeError = {
  type: "ProtocolChangeTooLargeError",
  timestamp: createTimestamp(),
  size: PositiveInt.orThrow(1_015_851),
};
const skippedError: SyncRouteError = { ...tooLarge, at: Millis.orThrow(1000) };

if (skippedError.type === "ProtocolChangeTooLargeError")
  assertEqual(skippedError.size, 1_015_851);
```
