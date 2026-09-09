# Clock drift handling

Status: proposal for review, not implemented.

This note settles how Evolu treats Hybrid Logical Clock failures: local
`TimestampDriftError` and `TimestampTimeOutOfRangeError`, and the same failures triggered by received
messages. SharedWorker already supplies a fixed clock and captured wall time for
each queued write, and DbWorker acknowledges the resulting clock after commit.
See [Shared.ts](../packages/common/src/local-first/Shared.ts) and
[Db.ts](../packages/common/src/local-first/Db.ts).
This clock-drift work adds rejection responses and queue completion for clock
failures, which are not fatal. SQLite failure handling is a separate follow-up.

## Problem

`receiveTimestamp` refuses a remote timestamp whose millis exceed the local wall
clock by more than `maxDrift` (five minutes by default). A device whose system
clock is far ahead does not notice: `sendTimestamp` checks drift only against
that device's own clock. Its writes reach the relay, which stores them without
looking at timestamps, and every other device refuses them.

On the receiving side, `writeMessages` in [Db.ts](../packages/common/src/local-first/Db.ts)
rejects the whole batch before its transaction. Range reconciliation then sees
that the client still lacks those timestamps and resends them on every sync.
Sync for that owner stays blocked until wall time reaches the bad timestamp
minus `maxDrift`. If the clock was an hour ahead, sync heals in an hour. If it
was a year ahead, sync is dead for practical purposes.

Locally, the same check applies to `sendTimestamp`. Once the persisted clock is
far ahead of wall time, every local mutation fails until wall time catches up.
That happens to a device after it accepted a far-future remote timestamp or
after its own clock was corrected backwards.

Today a local clock error is only broadcast; the shared queue never completes
its head and every later request for that database hangs. Leader replacement
retains the pending write's input clock and captured `now`, so replay repeats a
drift failure even after wall time catches up. This clock-drift work adds queue
completion and defines what the rejection means.

Counter exhaustion now advances the logical millisecond by one and resets the
counter to zero. The captured `now` remains unchanged, making rollover
deterministic across replay. The resulting timestamp must still fit within
`Millis` and `maxDrift`; even a single rollover can fail if the input clock is
already at either boundary. Local-only changes do not consume HLC counters.
Local clock failures roll back the whole mutation but currently leave the queue
head pending. Incoming clock checks reject the affected batch before writing it.

## What a relay can and cannot do

The timestamp is encoded inside the encrypted payload and compared with the
envelope timestamp in `decryptAndDecodeDbChange`
([Protocol.ts](../packages/common/src/local-first/Protocol.ts)). A relay has no
encryption key, so it cannot forge or alter a timestamp. It can only deliver
messages that a key holder authored.

Consequently a malicious relay that skips any server-side check can let through
exactly one thing: a future timestamp authored by a legitimate device with a
broken clock. The effect on honest clients is that sync for that owner stops.
A malicious relay can already stop sync by not delivering messages, so refusing
the message gives the attacker nothing new and keeps local data intact.

The client-side refusal is therefore the invariant. Any relay-side check is
defense in depth for honest deployments, not a security boundary.

## Rejected alternatives

| Alternative                                 | Why not                                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make clock errors fatal for the database    | Nothing was written, so the condition is clean. Fatal kills reads and writes too, and after a reload it fails again on the same message. A peer with a bad clock would take down every client sharing that owner.                                  |
| Apply the message and let the clock advance | Every later local edit carries a future timestamp as well, and this device spreads the skew to every peer.                                                                                                                                         |
| Apply the message but clamp the local clock | The future write beats every later local edit under last-writer-wins until wall time passes it. Silent data loss instead of a visible stall.                                                                                                       |
| Quarantine it and mark it received          | Honest clients converge on ignoring it, but the author already applied it, and a client whose wall time has passed the timestamp when it syncs will accept it. Divergence is unavoidable once a bad clock has written; this only hides which side. |
| Skip only the bad message inside a batch    | Reconciliation resends it every round, so sync stays blocked anyway. Not worth the extra bookkeeping.                                                                                                                                              |

## Client behavior

### Local mutations

Clock errors during timestamp assignment reject that mutation batch and nothing
else. This implementation adds a rejection response so the shared queue completes its head
and continues. The originating Evolu instance receives the error through the
existing error channel. Release that mutation's completion callback registrations
without invoking them, preserving the existing success-only contract and other
pending mutations' callbacks. Today these registrations remain until instance
disposal. No row, history entry, or clock change is persisted.

Later batches rejected for drift will usually fail the same way until wall time
catches up. A rollover that exceeds `maxDrift` is also a drift failure; exceeding
the `Millis` range is a range failure. Queue completion prevents these failures
from blocking unrelated requests. Queries, exports, and incoming sync keep working.

### Incoming messages

A batch that fails validation or the clock check is not applied and does not
advance the clock. The failure is reported through the existing error channel
and recorded in sync state for that owner (see below). Sync for that owner is
blocked by construction: the relay will keep offering the same timestamps.

Invalid protocol data, version mismatches, remote protocol errors, decryption
failures, and timestamp mismatches keep their current handling. They already do
not touch the clock or SQLite.

### Sync state

Replace the `SyncState` placeholder in
[Shared.ts](../packages/common/src/local-first/Shared.ts) with per-owner state
that can express, at minimum: syncing, blocked by a clock error with the
offending timestamp and the local time, and blocked by a relay rejection with
its error code. Applications need this to say "sync is blocked by a device with
a wrong clock" instead of failing quietly. The exact shape belongs to the sync
monitoring work already listed as a follow-up in that file; this note only
requires that clock blocks are visible there.

## Relay defense in depth

Add a timestamp check to `applyProtocolMessageAsRelay` before
`storage.writeMessages`. The relay refuses a write batch containing an envelope
timestamp whose millis exceed the relay clock plus `maxDrift`, and responds with
a new `ProtocolErrorCode` and a matching `ProtocolTimestampError` on the client
side, following the existing `WriteKeyError` and `QuotaError` pattern. The relay
gains `TimeDep` and `TimestampConfigDep`.

Checking the envelope timestamp is sufficient. A client rejects any message whose
envelope timestamp disagrees with the authenticated one, so lying in the
envelope does not get a message applied anywhere.

This protects other devices from accidental skew in honest deployments. It does
not protect the misconfigured device itself: by the time the relay rejects its
messages, its local history already carries future timestamps and its persisted
clock is ahead. After the user corrects the system clock, that device fails
`sendTimestamp` drift checks until wall time catches up. Recovery for that
device is a restore from mnemonic into a fresh database once the clock is
correct; writes stamped with the bad clock are lost unless wall time reaches
them. Document this limitation; do not add automatic repair.

## Optional: sender self-check

The only way to protect the misconfigured device is to detect skew before its
first write is stamped. The relay can include its current time in protocol
responses. A client whose clock differs from it by more than `maxDrift` reports
the skew in sync state and refuses to stamp new writes for owners synced through
that relay until the user acts.

This does not trust the relay for safety. `sendTimestamp` keeps using the local
clock; the relay time only gates whether the client writes at all. A lying relay
can cause a false block, which is a denial of service it already has, but never
a bad timestamp.

This is a wire-format change and is not required for clock-error completion.
Decide it separately.

## Validation

| Contract                                | Evidence                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local clock error is not fatal          | In `Shared.test.ts`, return a drift error for a mutation; the queue head completes, a following query executes, and no completion callback fires.                                        |
| Local clock error persists nothing      | In Node `Db.test.ts`, fail `sendTimestamp` midway through a mixed batch; rows, history, usage, timestamp sets, and the persisted clock are unchanged.                                    |
| Rejection releases only its callbacks   | Reject a mutation with registered completion callbacks; its registrations are removed without invocation, and a later successful mutation still invokes its own callbacks.               |
| Rollover failures complete the queue    | Cause rollover to exceed `maxDrift` or the `Millis` range; verify the same rejection completion and callback cleanup as other local clock failures, with no persisted changes.           |
| Incoming clock error blocks only sync   | Receive a batch with one far-future timestamp; nothing is applied, the clock is unchanged, a later local mutation succeeds, and sync state shows the block for that owner.               |
| Relay refuses future timestamps         | In `Protocol.test.ts`, the relay rejects a batch with an envelope timestamp beyond its clock plus `maxDrift` with the new error code and stores nothing; a batch within drift is stored. |
| Relay check does not trust the envelope | A message whose envelope timestamp is within drift but whose authenticated timestamp differs is rejected by the client with the existing mismatch error.                                 |
| Corrected clock behaves as documented   | Advance test time past the persisted clock, then move it back; local mutations fail with drift errors and queries still succeed.                                                         |

Run the affected Node suites, lint changed files, and repository typechecking.
Relay changes need the relay integration tests for the write path. No full
verification or benchmark run is implied by this note.

## Decisions to validate

- Clock failures reject the affected batch and keep the database session
  usable. This clock-drift work adds rejection responses and queue completion
  to the existing idempotent execution path.
- The client-side drift refusal is the invariant. The relay check is defense in
  depth and may be absent or disabled without affecting data safety.
- Sync blocked by a clock error must be visible in sync state per owner.
- The misconfigured device recovers by restore, not by automatic repair.
- The sender self-check via relay time is deferred and decided separately.
