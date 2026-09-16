---
"@evolu/common": patch
---

Fixed writes failing when the device clock is wrong

TLDR: A wrong device clock can give changes future timestamps, which can
override edits made later on other devices. Correcting system time can leave
Evolu's logical clock ahead, because it never moves backwards. Previously,
clock drift could fail writes and stall the write queue. A full app restart
discarded the blocked mutation without necessarily fixing the drift. Now those
changes are saved in quarantine while writes and sync continue. Apps can query
quarantine to show users what is waiting. Eligible changes are applied when
the database worker starts with system time within the drift limit. Correcting
time alone does not release quarantined changes in a running worker.

Local mutations and incoming messages whose timestamps exceed the clock-drift
limit (five minutes by default) are now stored in `evolu_message_quarantine`
and synchronized without being applied to application tables. Drift no longer
blocks the local write queue or causes incoming messages to be rejected and
repeatedly offered by sync. Mutations complete after storage commits, including
offline; `onComplete` can fire while the change remains quarantined. Apps can
query quarantine to show pending changes. Drift is not reported through
`EvoluError`. Quarantining an incoming message does not advance the local clock.
Incoming messages within the limit still apply when the local logical clock
is ahead.

Databases at version 1 are migrated to version 2 at startup. The migration adds
the quarantine columns `reason` (schema or timestamp drift), `origin` (local
mutation or received message), and `quarantinedAt` (captured system time), plus
the index that startup release reads. `createQuery` types the whole table;
`QuarantineReason` and `QuarantineOrigin` export the persisted codes. See the
tested example on `QuarantineReason`.

Drift quarantine is released only when the database worker starts, once the
message's timestamp is within the drift limit. Startup loads only drift
timestamps within that limit. Unknown columns remain in schema quarantine until a
schema update. Duplicate delivery does not release messages.
Subscribed queries refresh when the database worker is replaced, and clocks
remain monotonic across replacement and replay, including when an empty
`memoryOnly` replacement reports an older clock.

Local-only mutations avoid clock persistence. Duplicate deliveries skip message
writes, and duplicate-only batches avoid rewriting owner usage. Clock persistence
uses one guarded update, including on replay.

Recovery APIs for messages further ahead remain future work. Range exhaustion
at the timestamp ceiling still leaves a local mutation's queue waiting. Copied
databases sharing an owner and node ID remain unsupported and can silently lose
colliding changes even when `onComplete` fires. See the Timestamp module
documentation for these limitations and the detailed drift and release rules.

`sendTimestamp` and `receiveTimestamp` now take captured system time as an
explicit `Millis` argument. Their dependencies contain only drift configuration.
Both return `TimestampError` for drift or range exhaustion, including after
counter rollover. Success means the resulting timestamp is within both limits.
`receiveTimestamp` also rejects remote drift before clock arithmetic.

`TimestampDriftError.timestamp` replaces `next` with the complete timestamp.
With `cause: "local"`, it is the failed operation's candidate, which the
database uses for explicit recovery. With `cause: "remote"`, it is the received
timestamp itself, which must not advance the clock.

```ts
import { assertErr, Millis, type TimestampDriftError } from "@evolu/common";
import {
  Counter,
  createTimestamp,
  receiveTimestamp,
  sendTimestamp,
} from "@evolu/common/local-first";

const deps = { timestampConfig: { maxDrift: 300000 } };
const now = Millis.orThrow(0);
const local = createTimestamp();
const future = createTimestamp({ millis: Millis.orThrow(300001) });
assertErr(sendTimestamp(deps)(future, now), {
  type: "TimestampDriftError",
  timestamp: { ...future, counter: Counter.orThrow(1) },
  cause: "local",
  now,
});

assertErr(receiveTimestamp(deps)(local, future, now), {
  type: "TimestampDriftError",
  timestamp: future,
  cause: "remote",
  now,
});

const _previousCalls = () => {
  // @ts-expect-error sendTimestamp now requires captured milliseconds.
  sendTimestamp(deps)(local);
  // @ts-expect-error receiveTimestamp now requires captured milliseconds.
  receiveTimestamp(deps)(local, future);
};

// @ts-expect-error TimestampDriftError.next was replaced by timestamp.
type _PreviousNext = TimestampDriftError["next"];
```
