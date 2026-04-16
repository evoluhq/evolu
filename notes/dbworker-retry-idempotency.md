# DbWorker Retry and Idempotency Notes

## Problem Summary

Evolu currently uses this execution model:

- Each Evolu instance creates its own DbWorker.
- Only one DbWorker per Evolu name becomes the leader and owns SQLite WASM.
- SharedWorker acts as a coordinator and queues requests.
- If the current queue head does not get a response, SharedWorker retries that same request until some leader replies.

This architecture is fine. The bug is narrower:

- Query replay is safe.
- Export replay is safe.
- Mutation replay is not safe because DbWorker currently derives fresh clock and time values while handling a request.

As a result, replaying the same queued mutation after leader failover does not replay the same logical operation.

## Current Failure Modes

### 1. Mutations are not retry-safe

Local mutation handling currently reads live mutable state inside DbWorker:

- HLC clock is read from DbWorker memory.
- `sendTimestamp` depends on both the previous clock and current time.
- `receiveTimestamp` also depends on current time.
- Local-only changes use wall clock time directly.

Therefore the same request can produce different results when retried on a new leader.

### 2. SharedWorker queue can stall on mutation error

Current queue behavior:

- Queue head advances only after `OnQueuedResponse`.
- Mutation errors are currently reported via `OnError` only.
- That means the queue head is never completed on mutate failure.

This is a separate bug from idempotency. Even after making requests deterministic, the queue still needs a completion path on error.

## Preferred Design

### Core rule

DbWorker must become deterministic for a given request.

That means:

- No `clock.get()` during request execution.
- No `sendTimestamp(...)` during request execution.
- No `receiveTimestamp(...)` during request execution.
- No `time.now()` during request execution.

DbWorker should only:

- apply the exact request payload it receives
- persist the committed clock value supplied by SharedWorker
- compute query rows / patches from the resulting DB state

### SharedWorker becomes the live clock coordinator

For each Evolu name, SharedWorker should keep in-memory session clock state.

Bootstrap:

- First leader initializes DbWorker from SQLite persisted clock.
- SharedWorker learns the initial clock for that Evolu name.
- SQLite remains the durable bootstrap source across app restarts.

Important:

- SharedWorker must not wait for DbWorker response to advance clock.
- That would reintroduce the crash gap.

Instead:

- SharedWorker advances clock before dispatch.
- SharedWorker stores the final assigned clock together with the queued request.
- If the request is retried, it is resent with the same materialized timestamps and same final clock.

## Local Mutations

Current issue:

- DbWorker currently assigns timestamps during `handleMutation`.

Desired change:

- SharedWorker materializes exact timestamps for local CRDT messages before dispatch.
- SharedWorker computes final post-request clock before dispatch.
- DbWorker applies precomputed messages and stores the provided final clock.

This makes retry of the same local mutation safe across leader failover.

## Received Sync Messages

Current issue:

- `ApplySyncMessage` currently advances clock in DbWorker using `receiveTimestamp`.

Desired change:

- SharedWorker updates session clock based on timestamps contained in received protocol messages.
- SharedWorker computes the final resulting clock before dispatch.
- DbWorker applies the received message using the supplied final clock and persists it on commit.

This keeps sync handling deterministic across retries too.

## Local-Only Changes

Current issue:

- `applyLocalOnlyChange` uses wall clock time directly for `createdAt` / `updatedAt`.

Desired change:

- SharedWorker must provide the millis used for local-only changes.
- DbWorker must stop calling `time.now()` for these requests.

Otherwise local-only replay remains non-idempotent even if CRDT messages are fixed.

## Sync Side Effects

One subtlety remains:

- Local DB state can be made deterministic and retry-safe.
- Immediate outbound sync messages can still be lost if the leader dies after DB commit but before SharedWorker receives the response.

This is acceptable for now if data consistency is the main priority.

Why acceptable:

- Data remains correct locally.
- Sync can catch up later on another trigger.

Lower-priority future improvement:

- make outbound sync side effects more durable or reconstructible
- optionally reconstruct `messagesByOwnerId` or use another outbox-like mechanism

## Required Queue/Error Fix

Independent of the deterministic redesign, SharedWorker queue handling must be fixed so mutate failures complete the queue head.

Current problem:

- `OnError` does not complete the current queued request.
- Only `OnQueuedResponse` advances the queue.

Required fix:

- either return mutation failure through `OnQueuedResponse`
- or attach enough request identity to `OnError` so SharedWorker can complete the queued head

Without this, one failing mutate can wedge the whole queue.

## Implementation Outline

### SharedWorker

- Add per-Evolu-name live clock state.
- Initialize that state from the first leader / persisted SQLite clock.
- When queueing or dispatching local mutation work, precompute:
  - exact timestamps for non-local changes
  - assigned millis for local-only changes
  - final clock after the request
- When queueing or dispatching received sync work, precompute final clock from incoming message timestamps.
- Store this materialized request data in the queued item so retries resend the same payload.

### DbWorker

- Stop deriving time-sensitive values during request execution.
- Apply precomputed request payload only.
- Persist supplied final clock as part of committed mutation/sync application.
- Keep SQLite clock persisted for restart bootstrap.

### Message Shape Changes

Likely required:

- Extend local mutate request payload so it carries precomputed timestamped operations and final clock.
- Extend sync apply request payload so it carries final clock.
- Extend local-only change application so it uses assigned millis from request payload.

## Final Recommendation

Keep the current overall architecture:

- SharedWorker as coordinator / queue hub
- DbWorker as SQLite WASM executor
- SQLite as durable source of truth

Do not add a request ledger table unless a smaller short-term fix is needed.

Preferred long-term fix:

- make queued requests deterministic before they reach DbWorker
- make retries resend the same fully materialized operation
- fix queue completion on error

## Manual Implementation Checklist

- Add per-name session clock state to SharedWorker.
- Define how SharedWorker bootstraps that clock from the first leader.
- Refactor local mutation path so SharedWorker precomputes all timestamps.
- Refactor sync apply path so SharedWorker precomputes final clock.
- Refactor local-only change handling to use request-provided millis.
- Keep committed clock persisted in SQLite.
- Fix mutate error path so queue head always completes.
- Re-test leader failover during:
  - local mutate before response
  - local-only mutate before response
  - apply sync message before response
  - mutate error path
