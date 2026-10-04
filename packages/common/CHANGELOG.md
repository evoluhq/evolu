# @evolu/common

## 8.18.0

### Minor Changes

- 8ad3dec: Fixed sync failing when a protocol message was nearly full

  Sync predicted message sizes with fixed safety margins, and some writes, such as
  the timestamps the other side already had, a range split, or the ranges answering
  an empty part of storage, were added without checking the space left. When large
  changes nearly filled a reply or request, an assertion failed: a relay logged it
  and sent no reply or replied with `ProtocolSyncError`, and a client's sync
  failed the same way. The data did not change, so every retry failed the same way
  and the owner stopped syncing through that relay. Sync now makes every write as
  a trial that measures the exact message and undoes the write when the message
  could no longer be closed, so it never fails on size and stays within
  `totalMaxSize` and `rangesMaxSize`. Splits and messages near the total size no
  longer leave margins unused, so some syncs take fewer rounds. Replies from a
  relay are fixed once the relay updates `@evolu/common`.

  A message without room for its next range ends with one fingerprint over
  everything after the last range it answered. That fingerprint used to leave out
  the range it could not answer and any skipped ranges before it, which cost
  redundant rounds.

  `ProtocolMessageBuffer.tryWrite` runs a write and keeps it only if the frame,
  measured exactly, still has room to be closed with one Fingerprint range with
  `InfiniteUpperBound` within `totalMaxSize` and `rangesMaxSize`. Otherwise it
  undoes the write, also when the write throws. An optional reserve holds room for
  bytes the caller adds later. Inside a trial, `addMessage` and `addRange` do not
  assert the size limit; outside one they assert that the frame fits
  `totalMaxSize` without safety margins. `getSize` now returns the exact encoded
  size; it used to add a 22-byte reservation once the frame had ranges.
  `canAddMessage`, `canSplitRange`, and `canAddTimestampsRangeAndMessage` were
  removed with their margins; make the write inside `tryWrite` instead, which
  returns whether it fit. The builder references each change rather than copying
  it, so a change, including one a custom `Storage.readDbChange` returns, must not
  be modified while the builder is in use. `unwrap` can now be called more than
  once; it used to append the message timestamps to the header again, so a second
  call returned a corrupt message.

  `createProtocolMessageFromCrdtMessages` and
  `createProtocolBroadcastMessagesFromCrdtMessages` use trials, so a change that
  fits the rest of a frame exactly is sent in it rather than in the next round or
  frame. A broadcast change that does not fit an empty frame still throws.

  The trials undo writes with the new `checkpoint` of `RunLengthEncoder` and
  `TimestampsBuffer`, which returns a function that restores the encoder or buffer
  in constant time.

  ```ts
  import {
    assertEqual,
    assertFalse,
    assertTrue,
    assertType,
    createId,
    createRunLengthEncoder,
    encodeNonNegativeInt,
    NonNegativeInt,
    testCreateDeps,
  } from "@evolu/common";
  import {
    createProtocolMessageBuffer,
    defaultProtocolMessageMaxSize,
    encodeAndEncryptDbChange,
    MessageType,
    testAppOwner,
    testCreateCrdtMessage,
    type ProtocolMessageBuffer,
  } from "@evolu/common/local-first";

  const encoder = createRunLengthEncoder<NonNegativeInt>(encodeNonNegativeInt);
  encoder.add(NonNegativeInt.orThrow(5));
  const restore = encoder.checkpoint();
  encoder.add(NonNegativeInt.orThrow(5));
  assertEqual(encoder.unwrap(), new Uint8Array([5, 2]));
  restore();
  assertEqual(encoder.unwrap(), new Uint8Array([5, 1]));

  const deps = testCreateDeps();
  const crdtMessage = testCreateCrdtMessage(createId(deps), 1, "Ada");
  const message = {
    timestamp: crdtMessage.timestamp,
    change: encodeAndEncryptDbChange(deps)(
      crdtMessage,
      testAppOwner.encryptionKey,
    ),
  };
  const buffer = createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Request,
  });
  const emptySize = buffer.getSize();

  // Reserving the whole frame for later bytes leaves no room for the message.
  assertFalse(
    buffer.tryWrite(() => {
      buffer.addMessage(message);
    }, NonNegativeInt.orThrow(defaultProtocolMessageMaxSize)),
  );
  assertEqual(buffer.getSize(), emptySize);

  // ProtocolMessageBuffer no longer predicts whether a write fits.
  assertType<Extract<keyof ProtocolMessageBuffer, `can${string}`>, never>();

  assertTrue(
    buffer.tryWrite(() => {
      buffer.addMessage(message);
    }),
  );
  assertTrue(buffer.getSize() > emptySize);
  ```

- e2d22a3: Fixed sync looping forever on a stored change too large for any message

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
  const skippedError: SyncRouteError = {
    ...tooLarge,
    at: Millis.orThrow(1000),
  };

  if (skippedError.type === "ProtocolChangeTooLargeError")
    assertEqual(skippedError.size, 1_015_851);
  ```

- 7d804cd: Exported the `ProtocolErrorCode` type and tidied the protocol API

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

### Patch Changes

- 3d51568: Made the members of `Buffer` readonly

  Assigning a member of a `Buffer`, such as `shift`, no longer compiles. To change
  how a buffer behaves, create a new object that delegates to it.

  ```ts
  import { assertEqual, createBuffer, type Buffer } from "@evolu/common";

  const buffer = createBuffer([1, 2]);

  const _replaceShift = (): void => {
    // @ts-expect-error Cannot assign to 'shift' because it is a read-only property.
    buffer.shift = () => buffer.getLength();
  };

  const delegating: Buffer = { ...buffer, shift: () => buffer.shift() };
  assertEqual(delegating.shift(), 1);
  ```

- 969667e: Fixed synced strings losing a leading byte order mark

  A string value, table name, or column name that started with U+FEFF reached
  other devices without it, so they stored a different value than the device
  that wrote it. This happened, for example, with the first field of a CSV file
  read with its byte order mark. `decodeString` now keeps a leading U+FEFF.
  Devices on `@evolu/common` 8.17 and earlier still drop it from the strings they
  receive.

- 7d804cd: Rejected encrypted changes in a newer format

  The plaintext of an encrypted change starts with a format version, but
  `encodeAndEncryptDbChange` wrote `protocolVersion` there and
  `decryptAndDecodeDbChange` ignored it, so a change in a future layout would have
  been decoded into wrong values. The format version is now independent of
  `protocolVersion`. New changes still carry 1, so their bytes do not change.
  `decryptAndDecodeDbChange` returns `ProtocolInvalidDataError` for a version
  greater than 1, so a client skips such a change and shows it on the relay's
  route, as it does with any change it cannot decode, and stores it once an app
  update can read it. Version 0, which 6.0.1-preview.35 wrote in the same layout,
  still decodes.

- 6878627: Fixed a failed SQLite write during sync crashing a relay or a database worker

  When SQLite failed while storing received messages, for example on a full disk
  or a corrupt page, the relay's shared Run panicked, so the relay closed every
  connection and exited, and a supervisor restarting it got the same crash on the
  next write. On a client, the same failure panicked the database worker. Both
  now roll the write back and keep running. The relay logs the failure and
  answers the request with `ProtocolWriteError`, and a client reports it as the
  failure of the relay's route. A relay that cannot store a new owner's write key
  also answers with `ProtocolWriteError`, where it used to send no reply.

  `StorageWriteMessagesError` now includes `UnknownError`, which both built-in
  storages return when SQLite fails the write, so the error of
  `applyProtocolMessageAsClient` and `SyncRouteError` include it too. A custom
  `Storage` can return it as well; the relay answers it with
  `ProtocolWriteError`. Code that treats these errors as a `StorageQuotaError`
  must check their `type` first, and a switch over the `type` needs a case for
  it.

  ```ts
  import { assertEqual, createUnknownError } from "@evolu/common";
  import type {
    StorageQuotaError,
    StorageWriteMessagesError,
  } from "@evolu/common/local-first";

  const _quotaErrorBefore = (
    error: StorageWriteMessagesError,
  ): StorageQuotaError =>
    // @ts-expect-error An UnknownError is not a StorageQuotaError.
    error;

  const quotaErrorOf = (error: StorageWriteMessagesError) =>
    error.type === "StorageQuotaError" ? error : null;

  assertEqual(quotaErrorOf(createUnknownError(new Error("disk full"))), null);
  ```

- 3d51568: Released the memory kept after encoding a large JSON value

  `encodeJsonValue` encodes into a module-level scratch array that only grew, and
  it reserves 3 bytes per UTF-16 code unit of a string. `encodeSqliteValue` also
  kept a module-level buffer for JSON values. After a mutation with a JSON string
  near `maxMutationSize`, about 2.5 MB stayed allocated on the main thread and in
  the worker until they ended. A mutation rejected for exceeding the limit left
  more on the main thread, 12 MB for a 3,000,000-character string. The scratch
  array now returns to its initial size after a value grows it past 1 MiB, and
  `encodeSqliteValue` no longer keeps a buffer.

- 25b2140: Rejected malformed sync messages that no Evolu peer sends

  Sync decoded a message's ranges with no limit on their size or on the counts
  the message declared, so one crafted message could make a relay or client
  allocate hundreds of megabytes. Range upper bounds were not checked for order,
  so decreasing bounds made the peer reply with `ProtocolSyncError` or skip
  ranges silently. A request's unknown write key or subscription flag was read as
  no write key and no subscription change. A relay also stored changes shorter
  than any encrypted change, empty ones included, which its quota does not count,
  so one request could add over 100 MB to its database under a 1 MB quota.

  These messages are now rejected as `ProtocolInvalidDataError`:

  - A ranges section over 200,000 bytes, twice the largest
    `ProtocolMessageRangesMaxSize`, or a count of ranges or timestamps larger than
    the bytes after it.
  - Range upper bounds that decrease. Equal bounds stay valid.
  - A request whose write key flag is not 0 or 1, or whose subscription flag is
    not one of `SubscriptionFlags`.
  - On a relay, a request with a change shorter than 41 bytes, the smallest
    `EncryptedDbChange`.
  - On a relay, a request larger than its `totalMaxSize`, 1,000,000 bytes by
    default. A relay broadcasts a request's changes in a message of that size, so
    it stored the changes of a larger request and then rejected the request when
    they did not fit. The Node.js relay already closes the connection on a message
    over 1,000,000 bytes.

  A malformed message is now rejected before anything is stored, broadcast, or
  subscribed. A relay used to apply a request's subscription flag, store the
  owner's write key and changes, and broadcast them before decoding the rest, and
  a client stored a response's changes before decoding its ranges. A throw while
  applying a decoded message, such as from the relay's `broadcast` callback or a
  bug in reconciliation, is now a defect instead of `ProtocolInvalidDataError` or
  `ProtocolSyncError`. Only a storage failure during reconciliation is still
  answered with `ProtocolSyncError`.

  A relay logs a rejected message and does not reply, and a client reports it on
  the relay's sync route. Evolu clients and relays never send such messages, so
  no migration is needed. A client still accepts a short change from a relay and
  skips it in storage, because relays keep the short changes they stored before
  this fix.

- 6878627: Fixed relay writes slowing down as an owner's changes grew

  Before storing a batch, the relay checks which of its timestamps it already has.
  SQLite ran that check over every timestamp the owner had stored, so at 20,000
  stored changes it took 0.72 ms for a one-change write, and it grew with the
  owner. It now looks up each incoming timestamp by primary key, which took
  0.002 ms.

- 7d804cd: Fixed binary encoding errors in Safari before 17.2 and Firefox before 138

  `BufferError` and the protocol's decoding error called
  `Error.captureStackTrace`, which is not part of the JavaScript standard and
  which Safari added in 17.2 and Firefox in 138. In earlier versions, creating
  either error threw a `TypeError` instead. Decoding invalid bytes failed with
  that `TypeError` rather than a `BufferError`, a malformed protocol message was
  reported with it rather than the reason, and a mutation with a JSON string
  nested more than 1,000 levels deep threw instead of storing the string. Neither
  error calls it anymore; the `Error` constructor already records the stack trace.

- 6878627: Fixed storage queries hanging on a position past an owner's timestamps

  `getTimestampByIndex`, and the `iterate`, `fingerprint`, and
  `fingerprintRanges` of `createBaseSqliteStorage`, looped in SQLite forever and
  blocked the thread on an index at or past the owner's size, as the index of
  `getTimestampByIndex` or the `begin` of `iterate`, or on a bucket past that
  size, in `fingerprint` and `fingerprintRanges`. Sync never passes such a
  position. Those calls now throw an assertion error, and the `Storage` interface
  documents that no index may exceed the owner's size.

- 739817f: Made sync use less CPU and, with small ranges sections, fewer rounds

  Measured against 8.17.0 on an Apple M5, counting the protocol's CPU time
  without storage:

  - A relay sending 20,000 changes uses 8% less CPU, and 21% less when the changes
    are close to the 1 MB message size. A client uploading 20,000 changes uses 12%
    less. A message under construction now references the changes it carries and
    copies each one once, into the finished message, instead of copying it while
    building and again when finishing.
  - `decryptAndDecodeDbChange` uses 9% less CPU, because decoding no longer
    validates again what a value's branded type already proves.
  - With a `ProtocolMessageRangesMaxSize` of 3,000, syncs where each side lacks
    changes the other has take 9% to 15% fewer rounds, because messages are
    measured exactly and no longer keep safety margins unused. With the default
    of 30,000, they take the same rounds.

- 6878627: Fixed `deleteOwner` of `createBaseSqliteStorage` keeping the owner's usage row

  It deleted the owner's timestamps but kept its `evolu_usage` row, whose stored
  bytes and timestamp bounds then described data that was gone. The relay storage
  deleted that row itself, so relays were not affected.

- 6878627: Removed `Storage.setWriteKey`

  Nothing in Evolu called it. Sync stores an owner's write key on its first use
  through `validateWriteKey`. A relay built on `createRelaySqliteStorage` that
  replaced an owner's key with `setWriteKey` can delete the owner's row from
  `evolu_writeKey` instead; the relay then stores the next write key it receives
  for that owner. A custom `Storage` object literal that still lists
  `setWriteKey` fails the excess-property check; remove the member.

  ```ts
  import { assertType } from "@evolu/common";
  import type { Storage } from "@evolu/common/local-first";

  assertType<Extract<keyof Storage, "setWriteKey">, never>();
  ```

## 8.17.0

### Minor Changes

- 9cbd733: Fixed OwnerSecret rejecting secrets from mnemonics shorter than 24 words

  `mnemonicToOwnerSecret` accepts any valid `Mnemonic`, but it cast the decoded
  entropy to an `OwnerSecret` typed as 32 bytes, although only a 24-word mnemonic
  holds 32 bytes. A 12-word mnemonic produced a 16-byte secret that
  `OwnerSecret.is` rejected. `OwnerSecret` now accepts 16, 20, 24, 28, or 32
  bytes, the entropy of every BIP-39 mnemonic length, and `mnemonicToOwnerSecret`
  validates instead of casting. Owners keep the same keys.

  Shorter secrets are accepted for owners created by other apps, with less margin
  against a future quantum computer, which can be an acceptable trade-off for
  shorter backup phrases. `createOwnerSecret` still generates 32 random bytes, and
  an owner is post-quantum safe only when its secret has 256 bits of entropy. See
  [Post-quantum resistance](https://www.evolu.dev/docs/privacy#post-quantum-resistance).

  Code that passed an `OwnerSecret` where `Entropy32` is required must now check
  its length with `Entropy32.is`. The new `Entropy20` and `Entropy28` Types cover
  the remaining lengths, and `createSlip21` accepts them.

## 8.16.0

### Minor Changes

- a09e87b: Removed unused Console APIs

  `Console` no longer has `children`, `name`, or the `dir`, `table`, `time`,
  `timeLog`, `timeEnd`, `count`, and `countReset` methods. `ConsoleConfig` no
  longer has `name`, and `ConsoleMethod` has only the six level methods. The
  removed methods did not survive forwarding from a worker: a tab replaying a
  timer measured the gap between the replayed entries, not the timed work.

  To migrate:

  - Instead of setting a level on each of `children`, set it on the parent, which
    its children follow.
  - Instead of `Console.name`, use the last element of an entry's `path`. Remove
    `ConsoleConfig.name`, which never appeared in entries.
  - Instead of `time`, `timeLog`, and `timeEnd`, measure with
    `time.performance.now()` and log the duration. Instead of `dir`, `table`,
    `count`, and `countReset`, log the value, or your own counter, with `debug`.

- 2b2c7fb: Moved SQL logs to the trace level

  SQLite logged every query, its result, and each `begin`, `commit`, and
  `rollback` at the `debug` level, so `debug` output was dominated by SQL. These
  logs now use `trace`. Set the console level to `"trace"` to see them.

  `createNativeConsoleOutput` now writes trace entries with native
  `console.debug`, because native `console.trace` printed a stack trace with every
  call. To log a stack, pass `new Error().stack` as an argument.

- 90b0c0b: Fixed logging a value that cannot be cloned in a worker throwing

  Workers post each console entry to tabs, and a browser throws a
  `DataCloneError` for a value it cannot clone, such as an object holding a
  function. The error reached the code that logged the value. Both workers now
  post entries with the new `postConsoleEntry`, which replaces such an `Error`
  with the plain object `createUnknownError` makes of it, and any other such value
  with a string.

  `testCreateBroadcastChannel` now structured-clones each message like a native
  channel, so a test that posts a value that cannot be cloned fails as it would
  in a browser.

- eb06ba1: Fixed web workers ignoring the app's console level

  The database worker and each app's console in the SharedWorker logged at the
  default `log` level, whatever level the app's console had. A web app at `debug`
  never saw its database's sync logs, such as `requestSync` and
  `sendProtocolMessage`, an app at `trace` never saw SQL logs, and an app at
  `silent` still printed messages such as `leaderAcquired`. Each database worker
  and each app's SharedWorker console now use the level of the app that started
  them, and the rest of the SharedWorker uses the level of the tab that hosts its
  database workers.

  `Console.write` now drops entries below the console's level, so a tab prints the
  entries its workers forward only at its own level. The database worker of a
  `silent` app forwards errors, so unexpected failures set `evoluError`. On React
  Native, where workers already used the app's level, such failures of a `silent`
  app were lost and now set `evoluError`.

- 0e95535: Fixed the leak detector ignoring the console passed to createRun

  `createRun` built its development leak detector with a default console of its
  own, so a worker's leak warnings never reached the console the worker passed,
  and its tabs never saw them. The leak detector now reports to the console passed
  to `createRun`, and `createRunDefaultDeps` accepts a `console` for the same
  purpose. `testCreateRun` does the same, so a test that passes a console sees the
  warnings of `leakDetector.collect()` there.

### Patch Changes

- a09e87b: Fixed relative console timestamps showing a negative duration

  A relative timestamp from `createConsoleFormatter` printed `+-0.500s` when the
  clock was set back or `startTime` was ahead of the clock. It now shows `+0.000s`.

- 90b0c0b: Fixed UnknownError holding values that cannot be cloned

  `createUnknownError` kept an error's properties other than functions as they
  were, so an `Error` whose `cause` held a function produced an `UnknownError`
  that could not be posted between workers, and the SharedWorker threw while
  reporting such an uncaught error to its tabs. Such a property is now described
  as a string, and an `Error` in a property or in an array, such as the `errors`
  of an `AggregateError`, is converted like the error itself. An error that is its
  own `cause` no longer overflows the stack; reference cycles stay cycles. An
  inherited `name` and `message`, as in a `DOMException` such as
  `QuotaExceededError`, are now included too.

- f7e9439: Fixed child consoles ignoring their parent's level

  A child console copied the level its parent was created with, so `setLevel` on
  a parent reached none of its children. A child without its own level now
  follows its parent's current level, including later changes. A level set on the
  child itself still takes precedence, and `setLevel(null)` makes the child follow
  its parent again.

- a09e87b: Fixed logQueryExecutionTime measuring the wrong time

  The `logQueryExecutionTime` query option logged with `console.time` at the
  `debug` level, so it printed nothing at the default level, and a tab replaying a
  worker's timer measured the gap between the replayed entries instead of the
  query. It now logs `[logQueryExecutionTime]` with the query and its duration at
  the `log` level, like `logExplainQueryPlan`.

- 1137d52: Stopped starting a sync round when a database registers an owner again

  When a database that already syncs an owner registers it again, for example
  from another instance, through a relay another database already uses for the
  owner, it no longer starts a round through that relay. Every write of the
  database already uploads through each relay claimed for the owner, whichever
  instance made it, so the round reconciled nothing new. It only rechecked a route
  that had skipped a change or failed, which `Evolu.requestSync`, a reconnect, or
  a replacement database worker still do.

- 1137d52: Narrowed sync route types to what the shared worker publishes

  The `error` of a `ProtocolInvalidDataError` or a
  `DecryptWithXChaCha20Poly1305Error` in a `SyncRouteError` is now typed as
  `UnknownError`, which the shared worker always published, so apps no longer
  need to check it at runtime. `SettledSyncRoute.lastReceivedAt` is now `Millis`,
  because the reply that skipped the change always set it. The unused
  `SyncRouteErrorType` alias was removed; use `SyncRouteError["type"]` instead.
  Code that builds these values, such as a test fixture, now wraps the caught
  value with `createUnknownError` and gives a settled route its received time.

  ```ts
  import {
    assertEqual,
    assertType,
    createUnknownError,
    Millis,
    type UnknownError,
  } from "@evolu/common";
  import type {
    SettledSyncRoute,
    SyncRouteError,
  } from "@evolu/common/local-first";
  // @ts-expect-error SyncRouteErrorType is no longer exported.
  import type { SyncRouteErrorType as _SyncRouteErrorType } from "@evolu/common/local-first";

  const skipped: SyncRouteError = {
    type: "DecryptWithXChaCha20Poly1305Error",
    error: createUnknownError(new Error("wrong encryption key")),
    at: Millis.orThrow(1000),
  };
  if (skipped.type === "DecryptWithXChaCha20Poly1305Error")
    assertType<typeof skipped.error, UnknownError>();

  const _rawError: SyncRouteError = {
    type: "DecryptWithXChaCha20Poly1305Error",
    // @ts-expect-error A caught value in a route error is an UnknownError.
    error: "wrong encryption key",
    at: Millis.orThrow(1000),
  };

  // @ts-expect-error A settled route has received the reply that skipped its change.
  const _unreceived: SettledSyncRoute["lastReceivedAt"] = null;
  const lastReceivedAt: SettledSyncRoute["lastReceivedAt"] =
    Millis.orThrow(1000);
  assertEqual(lastReceivedAt, 1000);

  const errorType: SyncRouteError["type"] = skipped.type;
  assertEqual(errorType, "DecryptWithXChaCha20Poly1305Error");
  ```

## 8.15.1

### Patch Changes

- 22900a8: Rejected user-defined unique indexes

  Evolu now throws an assertion when creating an instance whose `indexes` option
  contains a unique index, including partial and composite unique indexes.
  Devices can independently create records with the same business value while
  offline. A unique constraint would reject these records during synchronization.

  Remove `.unique()` from existing index definitions. When duplicates matter,
  make them visible in the application and offer a way to resolve them, such as
  merging contacts or soft-deleting a duplicate. See
  [Uniqueness](https://www.evolu.dev/docs/schema#uniqueness) for the distributed
  data model and application guidance.

## 8.15.0

### Minor Changes

- fb4c82f: Reported a WebSocket the platform refuses to create instead of panicking

  When the platform's WebSocket constructor threw, for example for a URL with a
  fragment, a `ws:` URL on an `https:` page, or a Content Security Policy that
  blocks the URL, the throw panicked the Run that created the WebSocket. In
  Evolu's shared worker, that stopped sync for every tab. `createWebSocket` now
  reports it to `onError` as the new `WebSocketCreateError`, holding the thrown
  value, and stops connecting, because such a URL fails the same way on every
  attempt. In Evolu, the relay shows a `WebSocketCreateError` as its connection
  error in sync state, and other relays keep syncing.

  `WebSocketError` has a new member, so code that switches exhaustively over
  `WebSocketError["type"]` needs a case for `WebSocketCreateError`.

- 4d7e66b: Added Email and Uuid Types, and conversions between Uuid and Id

  `Email` accepts a valid email address as the WHATWG HTML Standard defines it,
  the same rule browsers enforce for `<input type="email">`. It does not
  normalize, and it accepts only ASCII, so use the `xn--` form of
  internationalized domains. Compose `maxLength(254)(Email)` to enforce SMTP's
  length limit.

  `Uuid` accepts an RFC 9562 UUID of any version or variant in its canonical
  lowercase form, so equal UUIDs are equal strings. Lowercase UUIDs from other
  sources before validating them.

  `uuidToId` and `idToUuid` convert between a `Uuid` and the `Id` with the same 16
  bytes. Unlike `createIdFromString`, the conversion is reversible, so records
  whose external keys are UUIDs don't need a separate column for the original key.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    Email,
    idToUuid,
    Uuid,
    uuidToId,
  } from "@evolu/common";

  assertOk(Email.fromUnknown("ada@example.com"), "ada@example.com");
  assertErr(Email.fromUnknown("Ada <ada@example.com>"));

  const uuid = Uuid.orThrow("0190a6f4-8c3e-7b2a-9d41-5e6f7a8b9c0d");
  const todoId = uuidToId<"Todo">(uuid);

  assertEqual(idToUuid(todoId), uuid);
  ```

### Patch Changes

- 9dbf790: Removed createEqRedacted

  `createEqRedacted` accepted any equality function, and its documentation
  compared secrets with `eqString`, which returns at the first different
  character. Comparing a secret with untrusted input that way can leak it through
  timing, and a timing-safe comparison exists only for bytes, so no generic
  version could be safe. The function also revealed values implicitly, while
  `Redacted` asks for every reveal to be explicit.

  This removal ships as a patch because the function was unsafe to use as
  documented. To compare two trusted values, reveal both explicitly. To check a
  secret against untrusted input, compare bytes with a constant-time
  `TimingSafeEqual` implementation.

  ```ts
  import {
    assertFalse,
    assertTrue,
    createRedacted,
    eqString,
    revealRedacted,
    type Brand,
  } from "@evolu/common";
  // @ts-expect-error createEqRedacted is no longer exported.
  import type { createEqRedacted as _createEqRedacted } from "@evolu/common";

  type ApiKey = string & Brand<"ApiKey">;

  using a = createRedacted("x" as ApiKey);
  using b = createRedacted("x" as ApiKey);
  using c = createRedacted("y" as ApiKey);

  assertTrue(eqString(revealRedacted(a), revealRedacted(b)));
  assertFalse(eqString(revealRedacted(a), revealRedacted(c)));
  ```

- d1e22b4: Declared toString and toJSON on Redacted

  The `Redacted` interface now declares the `toString` and `toJSON` methods its
  values already had. Both return `"<redacted>"`, so type-aware linters no longer
  report `no-base-to-string` when a Redacted value is stringified.

  ```ts
  import { assertEqual, assertType, createRedacted } from "@evolu/common";

  using secret = createRedacted("sensitive");

  assertType<ReturnType<typeof secret.toString>, "<redacted>">();
  assertEqual(String(secret), "<redacted>");
  ```

- bc56001: Stopped copying the AppOwner mnemonic into workers

  `useOwner` posted the owner object it received to the shared worker, which
  passed it on to the database worker. For an `AppOwner`, including the one Evolu
  uses automatically when transports are configured, that copied its mnemonic
  into both workers, which never read it. `useOwner` now posts only the owner's
  id, encryption key, and write key.

- d1e22b4: Fixed disposing Redacted values on runtimes that need the Symbol.dispose polyfill

  Redacted read `Symbol.dispose` when its module loaded. Apps call
  `installPolyfills()` from their entry point, but imported modules are evaluated
  before that call runs. On runtimes without a native `Symbol.dispose`, such as
  Safari, wrappers therefore had no dispose method: `using` threw
  `Object not disposable`, and the secret stayed revealable. Each wrapper now gets
  its dispose method when it is created.

  A detached dispose method, as in `stack.defer(secret[Symbol.dispose])`, now also
  disposes the wrapper. Before, it did nothing.

## 8.14.0

### Minor Changes

- 6710da3: Added `evolu.devicePersistence`, which replaced `onStorageUnavailable`

  `evolu.devicePersistence` resolves once the database starts to what Evolu knows
  for sure about keeping it on the device:

  - `Persisted`: the database is the app's own file, as in React Native.
  - `NotPersisted`: it is kept in memory, because the `memoryOnly` option asks for
    it or the browser offers no persistent storage, as in Safari's Private
    Browsing and Firefox's private windows. Changes that have not synced are lost
    when the tab hosting the database closes.
  - `Unknown`: a browser stores it but may delete it, as Chrome's incognito does
    when the session ends, without telling the app.

  Show users a notice for `NotPersisted`, and do not tell them their data is saved
  on the device unless it is `Persisted`. The examples no longer say so.

  Browsers may also delete a site's stored data when disk space runs low,
  including changes that have not synced yet. After the first local change of a
  database whose `devicePersistence` is `Unknown`, the web `createEvoluDeps` now
  asks the browser once per tab with `navigator.storage.persist()` to keep the
  site's data until the user deletes it. Chrome and Safari decide silently.
  Firefox shows a permission prompt, and each tab asks until the user allows it.
  To ask at another moment, or never, pass your own `requestPersistentStorage` to
  the web or React web `createEvoluDeps`.

  The `onStorageUnavailable` option of the web and React web `createEvoluDeps` was
  removed; use `evolu.devicePersistence` instead. A custom platform adapter no
  longer receives the `StorageUnavailable` shared worker message, and its shared
  worker must provide `getDevicePersistence` instead of the optional
  `isPersistentStorageAvailable`.

  The minimal React playground renders this inside a `Suspense` boundary:

  ```tsx
  /**
   * Tells the user when this device doesn't keep their data, and shows nothing
   * otherwise. That happens with the `memoryOnly` option, or where the browser
   * offers no persistent storage, as in Safari's Private Browsing or a Firefox
   * private window. See `DevicePersistence` in `@evolu/common/local-first`.
   */
  const DevicePersistenceNotice: FC = () => {
    // Resolves once the database starts.
    const devicePersistence = use(useEvolu().devicePersistence);
    if (devicePersistence !== "NotPersisted") return null;
    return (
      <p className="mb-4 text-sm text-gray-600">
        Your data isn&apos;t kept on this device. Changes that haven&apos;t
        synced are lost when you close this tab.
      </p>
    );
  };
  ```

  To never ask the browser to keep the site's data:

  ```ts
  import { assertSame, constVoid } from "@evolu/common";
  import type { createEvoluDeps } from "@evolu/web";

  type WebEvoluDepsOptions = NonNullable<Parameters<typeof createEvoluDeps>[0]>;

  const neverAsk: WebEvoluDepsOptions = { requestPersistentStorage: constVoid };

  assertSame(neverAsk.requestPersistentStorage, constVoid);
  ```

## 8.13.0

### Minor Changes

- 428350e: Added a sync status for apps and made sync state exact

  `syncStateToOwnerSyncStatus` in `@evolu/common/local-first` tells what an app
  shows about syncing one owner of one database: `NoRelays`, `Syncing`, `Synced`,
  `Offline`, or `Error` with its error. The error is the newest failure of any
  relay or, without one, the newest skipped change, because a failure stops
  syncing through its relay while a skipped change leaves out only that change.
  It takes the value of `deps.syncState`, which is null until the first snapshot,
  `evolu.name`, and the owner's ID. The React binding from `createEvoluBinding`
  has `useOwnerSyncStatus`, and `@evolu/vue` exports one. Both take the
  `deps.syncState` store of the deps the Evolu instance was created with. Without
  an owner, they return the app owner's status; otherwise they take the owner
  `useOwner` takes, and a null owner, for a component that waits for one, gives
  `NoRelays`. They update only when the status changes, not with every snapshot.

  `deps.syncState` now keeps the previous snapshot's object for every part that
  did not change, even when a part listed before it goes away, and a snapshot
  equal to the previous one no longer notifies subscribers.
  `syncStateToOwnerSyncStatus` returns the same object while the status is
  unchanged, so statuses can be compared with `===` in any framework, such as in
  an Angular `computed` or a Svelte `$derived`. The value caught inside a route's
  error, such as what a failed decryption threw, is an `UnknownError`, whose
  `error` holds its message, stack, and cause.

  The documentation of `OwnerSyncStatus` describes what to show, and the examples
  follow it. Evolu saves changes on the device before they sync, so show nothing
  while sync works. For `Offline` and `Error`, show one quiet line saying that
  changes are saved on this device, inside one element with `role="status"` that
  stays mounted, not with `role="alert"`. For `Error`, write actionable text for
  the error types the app handles, such as `ProtocolQuotaError`, and generic text
  otherwise.

  A relay's first connection now counts as `Syncing`, not `Offline`, so apps no
  longer show offline on every start until the relay connects. A relay is
  `Offline` once a connection fails or closes, until a connection opens again.

  Sync state is now made of unions, so each part holds only the fields valid for
  its state, and it no longer stores values derived from others. Code reading it
  stops compiling where it has to change:

  - `syncStateToOwnerSyncStates` and `OwnerSyncState` are removed. The `type` of
    `syncStateToOwnerSyncStatus(state, name, ownerId)` replaces `status`:
    `"initial"` becomes `NoRelays`, which also covers a missing snapshot,
    database, or owner, and `"syncing"`, `"synced"`, `"offline"`, and `"error"`
    become `Syncing`, `Synced`, `Offline`, and `Error`, whose `error` replaces the
    owner's `error`. To list every database and owner, as
    `syncStateToOwnerSyncStates` did, pass the `name` of each `Active` tenant in
    `state.tenants` with the `ownerId` of each of its `Writable` owners.
  - `syncStateToRelaySyncStates(state, name, ownerId)` replaces `relays`, and
    `relaySyncStateToStatus(relay)` replaces `relay.status`. The newest
    `completeAt` of their routes replaces `syncedAt`.
  - A transport's `type` is its kind, `WebSocket`, and its `connection` replaces
    `readyState`, `openedAt`, `closedAt`, and `error`. It is `Connecting` only
    before the first connection opens or fails, `Open` with `openedAt`, or
    `Disconnected` with `disconnectedAt` and the last `openedAt`, if any. Both
    `Open` and `Disconnected` keep the last `error`. A transport becomes
    `Disconnected` when a connection closes or fails or a request goes
    unanswered, and failed reconnect attempts keep the time it disconnected. A
    closing transport is `Open` until it closes.
  - A tenant is `Active` with `owners`, or `Refused` with its
    `UnsupportedDbVersionError` and no owners, instead of having `refused`.
  - An owner is `Writable` with `routes`, or `Readonly` with `transportIds`,
    instead of having `writable`. A writable owner's transport IDs are the
    `transportId` of its routes.
  - A route is `Pending`, `Settled`, or `Complete` instead of having `complete`
    and `error`. `Pending` holds both its `failure` and its `skippedError`,
    `Settled` holds the `skippedError` that keeps it incomplete, `completeAt` is
    required on `Complete`, and `lastSentAt` is required on `Settled` and
    `Complete`.

  ```ts
  import {
    assertEqual,
    createId,
    Millis,
    testCreateDeps,
    testName,
  } from "@evolu/common";
  import {
    syncStateToOwnerSyncStatus,
    testAppOwner,
    type SyncState,
    type SyncTenant,
    type SyncTransport,
  } from "@evolu/common/local-first";

  const deps = testCreateDeps();
  const transportId = createId<"SyncTransport">(deps);
  const state: SyncState = {
    transports: [
      {
        type: "WebSocket",
        id: transportId,
        label: "wss://relay.example",
        connection: {
          type: "Disconnected",
          disconnectedAt: Millis.orThrow(2000),
          openedAt: Millis.orThrow(1000),
          error: null,
        },
      },
    ],
    tenants: [
      {
        type: "Active",
        name: testName,
        owners: [
          {
            type: "Writable",
            ownerId: testAppOwner.id,
            routes: [
              {
                type: "Pending",
                transportId,
                failure: null,
                skippedError: null,
                completeAt: Millis.orThrow(1500),
                lastSentAt: Millis.orThrow(1800),
                lastReceivedAt: Millis.orThrow(1500),
              },
            ],
          },
        ],
      },
    ],
  };

  // @ts-expect-error A transport has no readyState; its connection tells whether it is open.
  type _ReadyState = SyncTransport["readyState"];
  assertEqual(state.transports[0]?.connection.type, "Disconnected");

  const _tenant: SyncTenant = {
    type: "Active",
    name: testName,
    // @ts-expect-error A tenant has no refused flag; its type tells whether it refused startup.
    refused: false,
    owners: [],
  };
  assertEqual(state.tenants[0]?.type, "Active");

  const status = syncStateToOwnerSyncStatus(state, testName, testAppOwner.id);
  // @ts-expect-error An owner sync status is an object; compare its type.
  const _isOffline = status === "offline";
  assertEqual(status, { type: "Offline" });
  ```

- 428350e: Added shareStructure to keep the unchanged parts of copied data

  `shareStructure(previous, next)` returns `next` with every part deep-equal to
  the same part of `previous` replaced by that part, or `previous` itself when the
  two are deep-equal, except that a part a cycle leads back to is returned as it
  is in `next`. Data that arrives as a new copy, such as a structured clone
  posted between workers, then keeps the objects of its unchanged parts, so they
  can be compared with `===`, and a UI updates only what changed. Plain objects,
  arrays, and `Uint8Array`s are compared by their contents, and any other value
  by identity.

  An array item is compared with the previous item at its index. The optional
  `itemToKey` compares it with the previous item of the same key instead, such as
  its ID, so an item keeps its object when an item before it is removed.

  ```ts
  import {
    assertNotSame,
    assertSame,
    isPlainObject,
    shareStructure,
  } from "@evolu/common";

  const previous = {
    user: { name: "Alice" },
    todos: [
      { id: 1, title: "Buy milk" },
      { id: 2, title: "Walk the dog" },
    ],
  };

  // An equal copy gives the previous value back.
  assertSame(shareStructure(previous, structuredClone(previous)), previous);

  // Todos compared by ID keep their objects when a todo before them is removed.
  const next = shareStructure(
    previous,
    { user: { name: "Alice" }, todos: [{ id: 2, title: "Walk the dog" }] },
    (item) => (isPlainObject(item) ? item.id : undefined),
  );
  assertNotSame(next, previous);
  assertSame(next.user, previous.user);
  assertSame(next.todos[0], previous.todos[1]);
  ```

- 6257650: Added `unregister` to `Callbacks`

  `Callbacks.unregister` removes a registered callback without executing it, for
  a request whose response will never come.

  ```ts
  import { assertSame, createCallbacks, testCreateDeps } from "@evolu/common";

  using callbacks = createCallbacks(testCreateDeps());
  let calls = 0;
  const id = callbacks.register(() => {
    calls++;
  });

  // The response will never come, so the callback is removed without running.
  callbacks.unregister(id);
  callbacks.execute(id);
  assertSame(calls, 0);
  ```

### Patch Changes

- 9e5a033: Stopped reporting aborts during resource cleanup as defects

  When a Task was aborted while an `await using` resource was open and the
  resource's cleanup also observed the abort, for example by awaiting a Fiber or
  disposing a DisposableRun whose finalizer defected, JavaScript threw a
  `SuppressedError` holding only AbortErrors. The Run reported it as a defect and
  panicked, so aborting one `AbortableFiber` disposed the whole Run tree, and a
  panic or a DisposableRun finalizer defect was reported a second time. Such a
  `SuppressedError` is now an abort, as the same cleanup in `try`/`finally` is:
  the Task aborts with the last cleanup AbortError. A DisposableRun finalizer that
  rejects with an AbortError, such as one awaiting another DisposableRun whose
  finalizer defected, is no longer reported either; async disposal rejects with
  that AbortError. A `SuppressedError` containing any other error is still
  reported whole.

- 6257650: Reported a mutation that could not be stored instead of stalling its database

  When SQLite failed to store a mutation, for example because the disk was full,
  the database worker never answered it. Every later query, mutation, and export
  of that database then waited in every tab until the tab running the database
  worker closed, and `evoluError` reported nothing. Now the mutation rolls back
  as before and later requests run. The tab that made it gets an `UnknownError`
  in `evoluError`, or every tab does when its Evolu instance was disposed first.

  The mutation is not saved, and neither are the other mutations in its batch,
  usually those made in the same synchronous block, because they are stored in
  one transaction. Their `onComplete` callbacks do not run.

- eeaa3c5: Removed `isIdle` from semaphore and shared resource snapshots

  `SemaphoreSnapshot` and `SharedResourceSnapshot` no longer have `isIdle`,
  because it only repeated what their other fields show. This affects the
  snapshots of semaphores, mutexes, mutex refs, their keyed variants, and shared
  resources. A semaphore snapshot is idle when `taken` is 0 and `waiters` is
  empty. A shared resource snapshot is idle when `leaseCount` is 0,
  `hasResource` and `idleDisposePending` are false, and its `mutex` snapshot is
  idle. `Semaphore.isIdle()` and the keyed `isIdle(key)` functions are
  unchanged.

  ```ts
  import { assertSame, assertTrue, createSemaphore } from "@evolu/common";

  const semaphore = createSemaphore(2);
  const snapshot = semaphore.snapshot();

  // @ts-expect-error SemaphoreSnapshot no longer has isIdle.
  assertSame(snapshot.isIdle, undefined);

  assertTrue(snapshot.taken === 0 && snapshot.waiters.length === 0);
  assertTrue(semaphore.isIdle());
  ```

- 428350e: Moved sync errors from evoluError to sync state

  A problem syncing an owner through a relay belongs to that relay and often
  repeats in every round, so it no longer goes to the global `evoluError` store.
  `ProtocolError` and `StorageQuotaError` are no longer `EvoluError` members, so
  `EvoluError` holds only app-level errors: `OtherBuildRunningError`,
  `UnknownError`, and `UnsupportedDbVersionError`. An unexpected failure while
  syncing, which Evolu logs, is still an `UnknownError`.

  Sync state shows each sync problem with its details on the relay's route, as
  the route's `failure`, or `skippedError` for a skipped change, and as the
  owner's `Error` status. Because sync state shows them, tabs no longer log them
  to the console. Apps that reacted to one of these errors through
  `evoluError` read it there instead: a `ProtocolQuotaError` still means more
  relay quota, then `evolu.requestSync`, and a `ProtocolVersionError` still means
  an app or relay update. An app that showed every `evoluError` no longer shows
  these problems. Show them from sync state instead, as the examples do: use
  `useOwnerSyncStatus` from the React binding that `createEvoluBinding` returns
  or from `@evolu/vue`, or `syncStateToOwnerSyncStatus`, and show the `Error`
  status. `evoluError` reported these problems for every owner of every database,
  but a status covers one owner of one database, so an app that handled them for
  other owners checks each owner it syncs: with `useOwnerSyncStatus` where it
  shows that owner's data, or with `syncStateToOwnerSyncStatus` for each
  `Writable` owner of its database.

  ```ts
  import { assertTrue, Millis, type EvoluError } from "@evolu/common";
  import {
    testAppOwner,
    type OwnerSyncStatus,
  } from "@evolu/common/local-first";

  const ownerId = testAppOwner.id;

  // @ts-expect-error A ProtocolQuotaError is no longer an EvoluError.
  const _evoluError: EvoluError = { type: "ProtocolQuotaError", ownerId };

  // Sync state shows it as the owner's Error status instead.
  const needsQuota = (status: OwnerSyncStatus): boolean =>
    status.type === "Error" && status.error.type === "ProtocolQuotaError";

  assertTrue(
    needsQuota({
      type: "Error",
      error: { type: "ProtocolQuotaError", ownerId, at: Millis.orThrow(1000) },
    }),
  );
  ```

  Evolu databases in one app that sync the same owner hand each other the changes
  they send, without waiting for a relay, so such a copy has no route. If applying
  a copy fails or skips a change, which only a bug can cause, such as the two
  databases holding different keys for the owner, `evoluError` reports it as an
  `UnknownError`.

- 3a83a48: Closed a failed shared worker so the app can be opened again

  When a defect stopped Evolu's shared worker, tabs opened afterwards connected
  to the failed worker and never loaded their data, even after a reload while
  another tab of the app stayed open. On React Native, deps created again
  connected to it too. The failed worker now closes, so the next tab or deps start
  a new one. Closing each open database also no longer reports an extra "Cannot
  use a disposed object." defect after the original one. Each DbWorker now stops
  once its shared worker ends, so a custom platform setup must give the shared
  worker and its DbWorkers the same `LockManager`, as the web and React Native
  setups do.

  An `UnknownError` in `evoluError` leaves Evolu in an unknown state, so the app
  can only ask the user to close the tab. The documentation now says so instead of
  suggesting to try again.

- 36f9f81: Fixed one unreadable change stopping sync through a relay

  When a relay sent a change the client could not decrypt, verify, or decode, the
  client stored none of the batch that held it and ended the sync round. The relay
  offered the same change in every round, so reconciliation through that relay
  stopped: some changes made offline or before connecting never reached the
  relay, and a download split into several replies stalled.

  The client now stores every change it can decrypt, verify, and decode, skips the
  others, and continues the round, so everything else still syncs through that
  relay. A change is skipped when:

  - It was not created with the owner's encryption key, or was altered
    afterwards. A faulty or malicious relay, anyone who can write to a relay for
    the owner, or a client with a wrong key can send such a change.
  - An authentic change was replayed under another timestamp.
  - It is malformed, or it decrypts but this app version cannot decode it.

  A skipped change leaves nothing behind, not even its timestamp, because a stored
  timestamp would stop the client from ever fetching the real change with that
  timestamp from another relay. It is not quarantined either, because quarantine
  is synced to other relays. Skipping loses nothing: the relay keeps the change
  and offers it again on each sync, so once the receiving client is fixed, for
  example by updating the app or correcting its keys, the next sync stores it. A
  change that a client encrypted with a wrong key stays unreadable, because a
  relay never replaces a change it already holds for that timestamp. Once the
  client stores a valid change with that timestamp, for example from another
  relay, the relay no longer offers its copy, and the route completes with a later
  sync through that relay during which no changes arrive from other relays.

  Evolu cannot tell who is at fault, so it neither stops syncing the owner, which
  would let one bad actor stop sync through every relay, nor drops the valid
  changes, which no relay can forge. Sync state shows the skip on that relay's
  route, which stays incomplete. Every round through that relay downloads its
  skipped changes again, so changes the client receives from other relays start
  no round through it; they reach it with its next sync, such as after a
  reconnect or `evolu.requestSync`. The owner's `Error` status tells the user;
  an app can also stop syncing the owner through that relay. If every route of
  the owner shows `DecryptWithXChaCha20Poly1305Error` and your code creates or
  shares the owner, check the owner's keys.

  A change skipped from a relay is no longer reported through `evoluError`,
  because the relay offers it again in every round, so
  `DecryptWithXChaCha20Poly1305Error` is no longer an `EvoluError`. Watch sync
  state instead: the relay's route holds the `DecryptWithXChaCha20Poly1305Error`,
  `ProtocolTimestampMismatchError`, or `ProtocolInvalidDataError` of the first
  change skipped in a reply as `skippedError`, and a route whose reconciliation
  ends with it is `Settled`; a failure since the route last settled is its
  `failure`.

  A `SyncRouteError` is now the error itself with `at`, so it carries the details
  of every route failure, not only its `type`, which works as before. A
  `ProtocolInvalidDataError` leaves out its data, which can be a whole frame. Code
  that creates a `SyncRouteError`, such as a test fixture, must include the
  error's own fields, for example the `ownerId` of a `ProtocolQuotaError`, and an
  interface can no longer extend it.

  `StorageWriteMessagesError` now holds only `StorageQuotaError`. A custom client
  `Storage` skips a message it cannot decrypt, verify, or decode instead of
  rejecting its batch, as the built-in client storage does.

## 8.12.0

### Minor Changes

- 66ee0c8: Added a size limit for mutations

  A mutation larger than `maxMutationSize`, 640,000 bytes, now throws before
  anything is saved, so the code after it does not run. Previously such a change
  was saved but might never sync: every sync round asked for it again, and a
  shared worker hosting two databases stopped all work of that database, its
  queries, writes, and sync.

  The size is the change as encoded for sync, before padding and encryption, so
  plain text can use the whole limit at a byte per character. No string takes more
  than three bytes per UTF-16 code unit. Mutations of local-only tables are
  exempt. Give columns Types with a maximum length, so input that is too large is
  rejected where it enters the app, and check unbounded input with
  `evolu.getMutationSize`, which is typed by the schema. Binary values are now
  copied when a mutation is made, so later changes to a `Uint8Array` do not change
  what is saved.

  ```ts
  import {
    assertType,
    type Evolu,
    maxMutationSize,
    type NonEmptyTrimmedString100,
    type TestEvoluSchema,
  } from "@evolu/common";

  // Checks a mutation before making it.
  const fitsTodo = (
    evolu: Evolu<TestEvoluSchema>,
    title: NonEmptyTrimmedString100,
  ) => evolu.getMutationSize("todo", { title }) <= maxMutationSize;

  assertType<ReturnType<typeof fitsTodo>, boolean>();
  ```

- 58182e2: Added concatByteArrays

  `concatByteArrays` copies an array of Uint8Arrays into one. Unlike
  `concatBytes`, which takes each array as a separate argument and overflows the
  call stack when many arrays are spread into it, it works for any number of
  arrays.

  ```ts
  import { assertEqual, concatByteArrays } from "@evolu/common";

  const chunks = Array.from({ length: 200_000 }, () => new Uint8Array([1]));

  assertEqual(concatByteArrays(chunks).length, 200_000);
  ```

### Patch Changes

- 29e1187: Fixed deeply nested JSON text stopping a database

  A string value that parses as JSON nested more than 1,000 levels deep, which
  takes only 2,002 characters such as `[[[…]]]`, made encoding its change for sync
  throw. The mutation was saved, but the error stopped the database: its later
  queries, writes, and sync never completed, and every sync round failed on the
  same change. Such a value is now encoded as a plain string, so it syncs, and a
  change already stored syncs on the next round.

- 58182e2: Fixed two ways one message could crash a relay

  An owner's first write whose changes were all empty made the relay compute a
  stored size of zero bytes and treat it as a defect, and a batch of more than
  about 125,000 messages overflowed the call stack. Either way, the relay's shared
  Run panicked, so every later connection failed. The relay now handles both.
  `StorageConfig.isOwnerWithinQuota` receives the stored size as a
  `NonNegativeInt`, because it can be zero; a callback that annotates it as
  `PositiveInt` must use `NonNegativeInt` instead.

  ```ts
  import { assertFalse, NonNegativeInt, testAppOwner } from "@evolu/common";
  import type { StorageConfig } from "@evolu/common/local-first";

  const config: StorageConfig = {
    isOwnerWithinQuota: (_ownerId, requiredBytes: NonNegativeInt) =>
      requiredBytes <= 1_000_000,
  };

  assertFalse(
    await config.isOwnerWithinQuota(
      testAppOwner.id,
      NonNegativeInt.orThrow(2_000_000),
    ),
  );
  ```

## 8.11.0

### Minor Changes

- ecbac00: Fixed local synchronization between databases

  Named databases with writable registrations for the same owner now receive each other's mutation and continuation uploads locally, including while relay sockets are closed or a relay's quota check is pending. Large mutation batches are split into complete frames.

  Added `createProtocolBroadcastMessagesFromCrdtMessages` for producing all broadcast frames from a mutation batch. Client protocol responses can also include a `broadcast` companion containing their uploaded messages.

  ```ts
  import {
    assertSame,
    createId,
    getOrThrow,
    testCreateDeps,
  } from "@evolu/common";
  import {
    createProtocolBroadcastMessagesFromCrdtMessages,
    MessageType,
    parseProtocolHeader,
    testAppOwner,
    testCreateCrdtMessage,
  } from "@evolu/common/local-first";

  const deps = testCreateDeps();
  const broadcasts = createProtocolBroadcastMessagesFromCrdtMessages(deps)(
    testAppOwner,
    [testCreateCrdtMessage(createId(deps), 1, "Ada")],
  );
  assertSame(broadcasts.length, 1);
  assertSame(
    getOrThrow(parseProtocolHeader(broadcasts[0])).messageType,
    MessageType.Broadcast,
  );
  ```

- fdac39e: Added sync state

  `createEvoluDeps` exposes `deps.syncState`, a `ReadonlyStore<SyncState | null>`
  beside `evoluError`, shared by every Evolu instance and kept current by the
  shared worker; a tab never receives snapshots from a worker of another app
  version. A snapshot lists every transport with an opaque id, a label that is
  the URL without its query, the ready state, and the last open, close, and error
  times; and every database with its owner registrations, each marked writable or
  readonly, with the transports claimed for the owner and, for a writable owner,
  one route per transport saying whether the database is reconciled with that
  relay: `complete`, `completeAt`, `lastSentAt`, `lastReceivedAt`, and the last
  `error`, whose `type` is a protocol error, the original storage write
  rejection, `WriteFailed`, or `SyncFailed`. Local-only writes leave completed
  routes complete; `isLocalOnlyTable` tells whether a table is local-only.

  A failed route retries at most once by itself before it completes again;
  further retries wait for `requestSync` or a reconnect.

  `syncStateToOwnerSyncStates` folds the routes into one `initial`, `syncing`,
  `synced`, `offline`, or `error` state per database and owner with the last
  synced time, the newest error, and each relay's transport, route, and own
  `syncing`, `synced`, `offline`, or `error` status. The completion rules are
  documented in the Shared module. The
  [Sync playground](https://www.evolu.dev/playgrounds/sync) shows the state of
  two relays while one goes down and catches up.

  ```ts
  import {
    assertEqual,
    createId,
    createStore,
    testCreateDeps,
  } from "@evolu/common";
  import type { SyncState, SyncStateDep } from "@evolu/common/local-first";

  const openRelayLabels = (deps: SyncStateDep): ReadonlyArray<string> =>
    (deps.syncState.get()?.transports ?? [])
      .filter(({ readyState }) => readyState === "open")
      .map(({ label }) => label);

  using syncState = createStore<SyncState | null>(null);
  assertEqual(openRelayLabels({ syncState }), []);

  const deps = testCreateDeps();
  syncState.set({
    transports: [
      {
        id: createId<"SyncTransport">(deps),
        label: "wss://relay.example",
        readyState: "open",
        openedAt: null,
        closedAt: null,
        error: null,
      },
    ],
    tenants: [],
  });
  assertEqual(openRelayLabels({ syncState }), ["wss://relay.example"]);
  ```

- d2973b9: Restarted WebSocket reconnect backoff after a healthy connection

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

- 69b756c: Added timestamp drift and ordering helpers

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

- ef320ff: Added createResettableResource

  `createResettableResource` holds one resource created by a Task and replaces it
  in place: `reset(observed)` disposes the current resource and runs `create`
  again, and `get` returns the current resource, or `undefined` while there is
  none. Consumers keep the same object across replacements. A reset is skipped
  when a resource other than `observed` is current, so every observer of one
  failed resource shares a single reset.

  At most one resource exists, so there is a gap with none while a reset runs;
  the resource's own API must model it, as a reconnecting connection models
  "connecting". `create` must not fail and must return a fresh object each time.
  The `ResettableResource` and `createResettableResource` API docs describe
  cancellation, disposal, and locking.

  ```ts
  import {
    assertEqual,
    assertSame,
    createRun,
    createResettableResource,
    ok,
    type Task,
  } from "@evolu/common";

  interface Connection extends Disposable {
    readonly id: number;
    readonly isClosed: () => boolean;
  }

  let nextId = 1;
  const createConnection: Task<Connection> = () => {
    const id = nextId++;
    let isClosed = false;
    return ok({
      id,
      isClosed: () => isClosed,
      [Symbol.dispose]: () => {
        isClosed = true;
      },
    });
  };

  await using run = createRun();
  await using connection = await run.ok(
    createResettableResource(createConnection),
  );
  const first = connection.get();
  assertEqual(first?.id, 1);

  await run.ok(connection.reset(first));
  assertSame(first?.isClosed(), true);
  assertEqual(connection.get()?.id, 2);

  // A late observer of the first connection does not reset the second.
  await run.ok(connection.reset(first));
  assertEqual(connection.get()?.id, 2);
  ```

- 5a671b2: Fixed writes failing when the device clock is wrong

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
  limit (five minutes) are now stored in `evolu_message_quarantine`
  and synchronized without being applied to application tables. Drift no longer
  blocks the local write queue or causes incoming messages to be rejected and
  repeatedly offered by sync. Mutations complete after storage commits, including
  offline; `onComplete` can fire while the change remains quarantined. Apps can
  query quarantine to show pending changes. Quarantining an incoming message
  does not advance the local clock.
  Incoming messages within the limit still apply when the local logical clock
  is ahead.

  `TimestampDriftError` is no longer an `EvoluError`, so drift is not reported
  through the `evoluError` store. Remove any `case "TimestampDriftError"` from
  switches over `EvoluError`. An app that showed a clock warning for it now gets
  no error: after a device's clock that ran ahead is set back by more than five
  minutes, the user's new changes are quarantined, and they appear only when the
  database worker starts with system time within five minutes of their
  timestamps. To tell users about changes waiting on a clock, subscribe to
  a drift-quarantine query as in the tested example on `QuarantineReason`, whose
  `origin` column tells the user's own changes from received ones.

  Existing databases are migrated at startup. The migration adds
  the quarantine columns `reason` (schema or timestamp drift), `origin` (local
  mutation or received message), and `quarantinedAt` (captured system time), plus
  the index that startup release reads. `createQuery` types the whole table;
  `QuarantineReason` and `QuarantineOrigin` export the persisted codes. See the
  tested example on `QuarantineReason`. An earlier release that opens a migrated
  database applies its drift-quarantined changes at once, so rolling back past
  this release can make that device diverge until system time passes their
  timestamps.

  Drift quarantine is released only when the database worker starts, once the
  message's timestamp is within the drift limit. Unknown columns remain in schema
  quarantine until a schema update. Duplicate delivery does not release messages.
  Subscribed queries refresh when the database worker is replaced, so changes
  released at its startup become visible.

  Recovery APIs for messages further ahead remain future work. Copied
  databases sharing an owner and node ID remain unsupported and can silently lose
  colliding changes even when `onComplete` fires. See the Timestamp module
  documentation for these limitations and the detailed drift and release rules.

  `sendTimestamp` and `receiveTimestamp` now take captured system time as an
  explicit `Millis` argument. Their dependencies contain only drift configuration.
  Both return `TimestampError` for drift, including after counter rollover.
  Success means the resulting timestamp is within the drift limit.
  `receiveTimestamp` also rejects remote drift before clock arithmetic.

  `TimestampDriftError.timestamp` replaces `next` with the complete timestamp,
  and the new `cause` field tells local drift from remote. With `cause: "local"`,
  `timestamp` is the failed operation's candidate, which the database uses for
  explicit recovery. With `cause: "remote"`, it is the received timestamp itself,
  which must not advance the clock.

  ```ts
  import {
    assertErr,
    Millis,
    type EvoluError,
    type TimestampDriftError,
  } from "@evolu/common";
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

  const _isPreviousDriftError = (error: EvoluError): boolean =>
    // @ts-expect-error TimestampDriftError is no longer an EvoluError.
    error.type === "TimestampDriftError";
  ```

- d2973b9: Reported WebSocket close events as `WebSocketCloseEvent`

  Close events are now reported as `WebSocketCloseEvent`, Evolu's own `code`,
  `reason` and `wasClean`, rather than the DOM `CloseEvent`. React Native
  delivers its own close event and exposes no `CloseEvent` global, so the DOM
  type promised an inheritance chain and an `instanceof` that do not hold there,
  and constructing one was not portable.

  A platform's close event is structurally assignable to the new type and is
  passed through unchanged, so reading it is unaffected; a handler annotated
  `(event: CloseEvent) => ...` must drop that annotation or narrow the value
  itself. This applies to `onClose`, `shouldRetryOnClose`, and
  `WebSocketConnectionCloseError`.

  ```ts
  import {
    assertEqual,
    type WebSocketCloseEvent,
    type WebSocketOptions,
  } from "@evolu/common";

  const closeCodes: Array<number> = [];
  const options: WebSocketOptions = {
    onClose: (event: WebSocketCloseEvent) => {
      closeCodes.push(event.code);
    },
    shouldRetryOnClose: (event) => event.code !== 1000,
  };

  const event: WebSocketCloseEvent = {
    code: 1006,
    reason: "",
    wasClean: false,
  };
  options.onClose?.(event);
  assertEqual(closeCodes, [1006]);
  assertEqual(options.shouldRetryOnClose?.(event), true);
  ```

- fdac39e: Distinguished converged and failed client protocol results

  `applyProtocolMessageAsClient` returned `NoResponse` for a converged round, a
  rejected storage write, a failed range reconciliation, and a missing write key
  alike. It now returns `Converged`, `Readonly`, or `Failed` instead, and reports
  a `Broadcast` before checking for a write key.
  `ApplyProtocolMessageAsClientNoResponse` is removed; code that handled
  `NoResponse` must handle these results instead. `Failed` with cause `Write` now
  identifies a logged exception thrown by calling the storage's `writeMessages`;
  an exception while its Task runs, as the built-in storages throw, aborts the run
  instead; cause `Sync` identifies a logged range reconciliation failure, which
  may follow committed writes.

  Expected write rejections return the original `StorageWriteMessagesError`
  through `Err`. Direct callers handle these in `result.error`, where they
  previously received a successful `NoResponse`. `Storage` implementations return
  these errors without reporting them, and the shared worker reports them through
  `evoluError`. A relay still answers a rejected write that is not a quota error
  with `ProtocolWriteError`.

  `Storage.writeMessages` returns `StorageWriteMessagesError` instead of only
  `StorageQuotaError`. Implementations may return any subset, while callers must
  handle every member. `EvoluError` now includes `StorageQuotaError`, a member of
  `StorageWriteMessagesError` that the built-in client storage does not return
  yet, so exhaustive handling of `EvoluError` must add it.

  Fingerprint-query exceptions stop synchronization instead of producing
  incomplete ranges. `createProtocolMessageForSync` propagates them to its caller
  and no longer requires `ConsoleDep`. While creating a round, the database worker
  logs the exception and still answers, so other owners keep synchronizing, and
  sync state reports `SyncFailed` for the failed owner's routes. While applying a
  frame, clients report `Failed` with cause `Sync`, and relays send a
  `ProtocolSyncError` response.

  ```ts
  import {
    assertEqual,
    assertType,
    err,
    type InferTaskErr,
    type Result,
  } from "@evolu/common";
  import type {
    applyProtocolMessageAsClient,
    ApplyProtocolMessageAsClientResult,
    ProtocolError,
    StorageWriteMessagesError,
  } from "@evolu/common/local-first";

  type ClientApplyError = InferTaskErr<
    ReturnType<typeof applyProtocolMessageAsClient>
  >;
  assertType<ClientApplyError, ProtocolError | StorageWriteMessagesError>();

  const describeApply = (
    result: Result<ApplyProtocolMessageAsClientResult, ClientApplyError>,
  ): string => {
    if (!result.ok) return result.error.type;
    return result.value.type;
  };

  const rejected = err<ClientApplyError>({
    type: "DecryptWithXChaCha20Poly1305Error",
    error: new Error("decryption failed"),
  });
  // @ts-expect-error Client apply errors now include storage rejections beyond ProtocolError.
  const _oldResult: Result<ApplyProtocolMessageAsClientResult, ProtocolError> =
    rejected;
  assertEqual(describeApply(rejected), "DecryptWithXChaCha20Poly1305Error");
  ```

- 0624d35: Fixed apps that stayed blank where the browser offers no storage

  Safari's Private Browsing offers no OPFS, so Evolu could not open its database
  there, and the app waited forever without reporting an error. Evolu now checks
  storage once when its shared worker starts, and without it keeps every database
  in memory. Data synced with a relay comes back, as on a new device, and nothing
  stays on the device afterwards, which suits checking your app on a borrowed
  phone. A persistent database the browser cannot reach right now is left
  untouched. Data that exists only locally, or has not synced yet, is lost when
  the tab hosting the database closes, even while other tabs stay open.

  The new `onStorageUnavailable` option of the web and React web
  `createEvoluDeps` tells the app, so it can tell the user, for example "Nothing
  from this session is kept on this device."

  A custom platform adapter must handle the new `StorageUnavailable` shared
  worker message in an exhaustive switch, and a platform that can lack persistent
  storage can give the shared worker `isPersistentStorageAvailable`.

- ecd1c0d: Fixed defect reports that showed only "[object Object]"

  The browser and React Native `createRun` passed a panic's `AbortError`, a plain
  object, to the platform's error reporter, which shows it only as
  "[object Object]" or similar. A worker's error reaches its page, including an
  error tracker listening there, as that text alone, so when a database worker
  failed, nothing said why. Both now report an `Error` from the new
  `defectToError`: a panic reports its defect, and any other value that is not an
  `Error` is described in one whose cause is what was reported. A `DOMException`,
  which Chromium reports from a worker without its name or message, is described
  with both.

  A custom `reportDefect`, such as one passing defects to an error tracker, can
  use `defectToError` too:

  ```ts
  import { assertSame, createRun, defectToError } from "@evolu/common";

  const errors: Array<Error> = [];
  await using run = createRun({
    reportDefect: (reported) => {
      errors.push(defectToError(reported));
    },
  });
  const defect = new Error("boom");

  run.panic(defect);

  assertSame(errors[0], defect);
  ```

- 568358b: Reported timestamp insertion results

  `BaseSqliteStorage.insertTimestamp` now returns `true` for a new timestamp and
  `false` for a duplicate. Calls that ignore the result continue to work; custom
  storage implementations must return whether they inserted the timestamp.

  ```ts
  import { assertType } from "@evolu/common";
  import type { BaseSqliteStorage } from "@evolu/common/local-first";

  assertType<ReturnType<BaseSqliteStorage["insertTimestamp"]>, boolean>();
  ```

- e7d27be: Fixed a new app version not working while an older one was open in another tab

  After a deploy that updated Evolu, opening the app while an older version was
  open in another tab could leave the new tab unresponsive.

  Now only one version of an app uses the local database at a time. When a new
  version opens, tabs of the old version reload by themselves. A tab the user is
  in reloads when they leave it. A reload loses unsaved UI state, so keep drafts
  in local-only tables.

  If an old version keeps running, for example in a tab of an Evolu release
  before this one, the new tab waits and reports the new `OtherBuildRunningError`.
  Apps can show a message asking the user to close the app's other tabs. The
  error clears by itself when the wait ends. An exhaustive `switch` over
  `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, type EvoluError } from "@evolu/common";

  const isOtherBuildRunning = (error: EvoluError | null): boolean =>
    error?.type === "OtherBuildRunningError";

  assertEqual(isOtherBuildRunning({ type: "OtherBuildRunningError" }), true);
  ```

  The web `createEvoluDeps` accepts a custom `reloadApp`, for example to save
  state first; it must still reload the page, because the other build waits until
  this tab reloads or closes. The default one now reloads the current page instead
  of loading `/`. The React web
  `createEvoluDeps` now accepts the same options as the web one, including
  `onSharedWorkerUnsupported`.

  Update `@evolu/web` together with `@evolu/common`; with an older `@evolu/web`,
  queries never complete. A custom platform adapter must forward the new
  `Connected` and `Error` shared worker messages and handle the new `Waiting`
  message. One that runs the shared worker in-process must connect every
  `createEvoluDeps` call in a JS runtime to one worker, as React Native does,
  because the worker holds the build lock until it is disposed. On React Native,
  Evolu keeps working after Fast Refresh recreates its dependencies.

- daf6295: Added explicit synchronization requests for active owners

  Call `evolu.requestSync(ownerId)` after resolving a relay quota error to retry locally
  stored changes. It requests a fresh reconciliation through the owner's active
  transports while preserving connections and subscriptions, including those shared
  by multiple instances or tabs. The call returns immediately; errors continue
  through the existing Evolu error store. It acts only on an owner with a
  writable registration in this database; other owner IDs are ignored.

  Requests skip sync-message creation while all of the owner's transports are
  closed. Synchronization starts automatically when a transport opens.

  ```ts
  import { assertType, type Evolu, type OwnerId } from "@evolu/common";

  // Call after successfully increasing the affected owner's relay quota.
  const onQuotaIncreased = (evolu: Evolu, ownerId: OwnerId) => {
    evolu.requestSync(ownerId);
  };

  assertType<
    typeof onQuotaIncreased,
    (evolu: Evolu, ownerId: OwnerId) => void
  >();
  ```

- d2973b9: Reconnected WebSocket connections that stop answering

  A connection can stay open while nothing reaches the other end: no close or
  error event arrives, so the WebSocket's own retry never runs and sync stalls
  indefinitely. The shared worker now reconnects a socket when a request for an
  owner has been outstanding for ninety seconds with no Response for that owner
  received since, long enough for a 1 MB request or reply to arrive at about 90
  kbit/s. Each timeout doubles the connection's timeout for every request on it,
  also after reconnecting, up to twenty-four minutes, so downloading a large
  history over an even slower link still finishes. The timeout belongs to the
  connection because a reply for one owner can wait behind another owner's large
  frame on it. A grown timeout lasts while a request is outstanding on the
  connection or a database synchronizing through it is not yet reconciled with the
  relay, because the small replies that start a recovery arrive quickly even on a
  link too slow for the large frame after them. The connection is abandoned
  without waiting for its closing handshake and a new one starts with a fresh
  retry schedule; the transport reports that moment as its close time, because the
  socket reports no close for it. The timeout is measured on a monotonic clock, so
  a system clock adjustment cannot make a request look timed out or keep one from
  being recognized. Transport close and error events are logged at debug level.

  `WebSocket` gained `reconnect` for that, which callers use when they know the
  connection is dead although it never closed. Reconnecting drops the connection
  without waiting for a close handshake, consults neither `onClose` nor
  `shouldRetryOnClose`, and does nothing after disposal, on a connection that is
  already closing or closed, or while the wrapper is waiting to retry. A
  connection that was open restarts the retry schedule; one that never opened
  keeps its backoff, having proved nothing.

  `reconnect` is a required member of `WebSocket`, so an implementation of
  `CreateWebSocket` other than `createWebSocket`, such as a test double or a
  custom transport, must add it. It settles the abandoned connection with the new
  `WebSocketReconnectError`, which widens `WebSocketRetryError`: a `shouldRetry`
  or `schedule` that switches exhaustively over that union must handle it.
  Reconnecting carries no close event, because nothing observed one to report.

  `testCreateWebSocket` gained `close`, which closes the newest socket for a URL
  and reports a close event with code 1006 unless given other fields, and
  `error`, which reports a WebSocket error. Its sockets implement `reconnect`, and
  the new `reconnectedUrls` records, in call order, the URLs whose socket was
  reconnected. As in `createWebSocket`, `reconnect` does nothing while the socket
  waits to retry after a close or a reconnect; `open` ends the wait. A URL can be
  created again after its socket was disposed; each socket keeps its own state and
  the helpers address the newest one. The event helpers `message`, `open`,
  `close`, and `error` throw for a disposed socket, because `createWebSocket`
  delivers no events after disposal; `message` and `open` previously invoked the
  handlers anyway.

  Its sockets also report `connecting`, which they previously could not.
  `createWebSocket` reports `connecting` before a socket opens and for as long as
  it retries after a close, and ends in `closed` only when disposed; the double
  reported `closed` for all of that, so a test could assert a state the real
  wrapper never produces. Sockets still start `open` by default;
  `{ isOpen: false }` now starts them `connecting`. A socket returns to
  `connecting` after `reconnect`, and after `close` stays `closed` for whatever
  the `onClose` handler schedules before becoming `connecting` again, matching
  when `createWebSocket` drops the closed socket. Assertions that expected
  `closed` in those places expect `connecting` now.

  ```ts
  import {
    assertEqual,
    assertOk,
    createRun,
    ok,
    testCreateWebSocket,
    type WebSocket,
    type WebSocketRetryError,
  } from "@evolu/common";

  const createWebSocket = testCreateWebSocket();
  await using run = createRun();
  const result = await run(createWebSocket("wss://relay.example"));
  assertOk(result);
  await using socket = result.value;

  socket.reconnect();
  assertEqual(socket.getReadyState(), "connecting");
  assertEqual(createWebSocket.reconnectedUrls, ["wss://relay.example"]);

  // A reconnect while waiting to retry does nothing; `open` ends the wait.
  socket.reconnect();
  assertEqual(createWebSocket.reconnectedUrls, ["wss://relay.example"]);
  createWebSocket.open("wss://relay.example");
  assertEqual(socket.getReadyState(), "open");

  const socketMembers = {
    send: () => ok(),
    getReadyState: () => "open" as const,
    isOpen: () => true,
    [Symbol.asyncDispose]: () => Promise.resolve(),
  };
  // @ts-expect-error A custom WebSocket without reconnect is rejected.
  const _customSocketWithoutReconnect: WebSocket = socketMembers;
  const _customSocket: WebSocket = { ...socketMembers, reconnect: () => {} };

  const retryErrorLabel = (error: WebSocketRetryError): string => {
    switch (error.type) {
      case "WebSocketConnectError":
        return "connect";
      case "WebSocketConnectionCloseError":
        return "close";
      case "WebSocketReconnectError":
        return "reconnect";
    }
  };
  assertEqual(
    retryErrorLabel({ type: "WebSocketReconnectError" }),
    "reconnect",
  );
  ```

- ba8c493: Added database versioning with startup refusal

  Evolu now records a database version, `dbVersion`, in its `evolu_version`
  table instead of the unused `protocolVersion`, and converts existing databases
  at startup. The version covers Evolu's internal storage format and how stored
  data is interpreted. It is independent of the application schema, which still
  evolves append-only, and of the network protocol version. This release supports
  database version 2 and migrates older databases to it.

  A database newer than the code supports appears when an older build opens data
  a newer one migrated: after a deployment, for example when an older build is
  loaded later from a cache, or after a downgrade, including installing an older
  React Native build. Evolu refuses such a database before writing anything, and
  every tab using it gets `UnsupportedDbVersionError` in `evoluError`, where it
  stays for the lifetime of the dependencies. Queries and exports of that
  database stay pending, and mutation `onComplete` callbacks do not run. The
  `EvoluErrorDep` API docs describe when the refusal is reported again. Only code
  from this release onward checks the version, so earlier releases are not
  protected. Nothing produces a newer database yet; the first refusal can come
  when a later release introduces version 3, so handle the error now.

  On the web, a refused tab reloads once for each stored version, so it loads the
  build the server now serves. The error is reported only when the reloaded build
  refuses the database too, or when the tab has no session storage.

  Apps should observe `evoluError` outside query-loading UI and show a blocking
  message for `UnsupportedDbVersionError`, such as asking users to update the
  app. An exhaustive `switch` over `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, PositiveInt, type EvoluError } from "@evolu/common";

  const describeError = (error: EvoluError): string => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The default handles every other EvoluError.
    switch (error.type) {
      case "UnsupportedDbVersionError":
        return "Your data requires a newer version of this app. Please update it.";
      default:
        return "Something went wrong.";
    }
  };

  assertEqual(
    describeError({
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(3),
      supportedVersion: PositiveInt.orThrow(2),
    }),
    "Your data requires a newer version of this app. Please update it.",
  );
  ```

- cf68cee: Added reusable local-first test fixtures

  Exported `testEvoluSchema`, `TestEvoluSchema`, `TestTodoId`, `TestProjectId`,
  `testTodoId`, and `testProjectId` for deterministic tests and examples with
  project-linked or independent todos, and `testLocalOnlyEvoluSchema`, which
  stores app owners in a local-only `_appOwner` table with operational keys,
  optional recovery secrets, and optional names. Also exported the existing
  `testAppName` from the common entrypoint.

  ```ts
  import {
    assertOk,
    createEvolu,
    testAppName,
    testAppOwner,
    testEvoluSchema,
    testLocalOnlyEvoluSchema,
    testProjectId,
    testTodoId,
  } from "@evolu/common";

  assertOk(testEvoluSchema.todo.id.from(testTodoId), testTodoId);
  assertOk(testEvoluSchema.todo.projectId.from(testProjectId), testProjectId);

  const _createAccounts = createEvolu(testLocalOnlyEvoluSchema, {
    appName: testAppName,
    appOwner: testAppOwner,
    transports: [],
  });
  ```

### Patch Changes

- f0101ca: Reduced SQL template parameter validation overhead

  The `sql` tagged template now validates only numeric parameters with `FiniteNumber`,
  continuing to reject `NaN` and infinities while trusting the declared input types
  for strings, blobs, and `null`. Invalid numbers now report `FiniteNumber` validation
  errors directly.

- fdac39e: Fixed redundant messages when reconciling small mismatched ranges

  A mismatched range with too few timestamps to split into fingerprints was
  answered with timestamps from the start of the owner's history instead of the
  range's own. Synchronization still converged, but the other side resent every
  message in that range. The range's own timestamps are now sent.

- b506c9b: Fixed synchronization routing across relays and databases

  A relay's response now continues only with that relay, and a round started by
  a socket opening or by a transport's first use goes only through that
  transport. Previously every such message was sent to all of the owner's
  relays. Owner messages received from one relay are now reconciled with the
  owner's other relays in the same session, instead of waiting for a reconnect. A
  database's first writable owner registration also reconciles its
  existing history through connections already claimed by other databases. A
  database using another already claimed connection starts its own reconciliation.
  Explicit `requestSync` calls and mutation uploads still reach every open
  transport. After a leader replacement, the owner's relays are reconciled again,
  because a response reporting stored messages may have been lost.

- b75abfa: Removed `TimestampTimeOutOfRangeError`

  The error stood for a system clock past the last time Evolu timestamps can
  represent, in August 10889, but `Time.now` already throws for such a clock, so
  Evolu never reported it.

  `TimestampTimeOutOfRangeError` is no longer an `EvoluError` or a
  `TimestampError`, which is now only `TimestampDriftError`. Remove any
  `case "TimestampTimeOutOfRangeError"` from switches over these errors.

- 5a671b2: Fixed owner filtering and selection in history query types

  Queries over `evolu_history` now expose the existing `ownerId` column as
  `OwnerIdBytes`, allowing typed selection and filtering by owner. No database
  migration is required.

  ```ts
  import {
    assertType,
    createQueryBuilder,
    type OwnerIdBytes,
    ownerIdToOwnerIdBytes,
    testAppOwner,
    testEvoluSchema,
    type TimestampBytes,
  } from "@evolu/common";

  const createQuery = createQueryBuilder(testEvoluSchema);
  const historyQuery = createQuery((db) =>
    db
      .selectFrom("evolu_history")
      .select(["ownerId", "timestamp"])
      .where("ownerId", "=", ownerIdToOwnerIdBytes(testAppOwner.id)),
  );

  assertType<
    typeof historyQuery.Row,
    { ownerId: OwnerIdBytes; timestamp: TimestampBytes }
  >();
  ```

- e270e42: Fixed TS2589 for lazy maps and records of widened Types

  A `map` or `record` whose key or value was a widened `AnyType`, such as a
  factory parameter, failed to compile with TS2589 "Type instantiation is
  excessively deep and possibly infinite". Its parent Type was the same map or
  record Type again, so the parent chain never ended. The parent of a map or
  record whose key or value has a parent is now a `RootMapType` or
  `RootRecordType` without a parent of its own. For concrete key and value Types,
  it is identical to the previous `MapType` or `RecordType` parent, including its
  errors and localization.

  ```ts
  import {
    assertOk,
    lazy,
    map,
    record,
    String,
    type AnyType,
  } from "@evolu/common";

  const createLazyMap = (element: AnyType) => lazy(() => map(element, element));
  const createLazyRecord = (element: AnyType) =>
    lazy(() => record(String, element));

  const names = new Map([["Ada", "Lovelace"]]);
  assertOk(createLazyMap(String).fromUnknown(names), names);
  assertOk(createLazyRecord(String).fromUnknown({ ada: "Lovelace" }), {
    ada: "Lovelace",
  });
  ```

- 09b1b5c: Refreshed queries invalidated before subscription

  Queries now catch up when a mutation or incoming sync invalidates a loaded result before its listener subscribes. This prevents an empty or stale UI during startup. Previously loaded rows remain available without suspending while the subscription refreshes them. Pending reads retain their promise identity, and valid cached reads are reused.

- fdac39e: Fixed writes waiting for the next synchronization round to upload

  A mutation was uploaded only through the writing Evolu instance's own writable
  registrations. A write from an instance that had not registered the owner as
  writable, or one that its database worker answered after the instance was
  disposed, was committed locally but reached the relays and the other databases
  using the owner only with the next synchronization round. Such a write is now
  uploaded as soon as the database worker answers it, through any writable
  registration of the owner in the same database. A write answered after its
  instance was disposed also refreshes the queries of the database's other
  instances.

- 0770038: Fixed received changes being applied to local-only tables

  Tables whose names start with an underscore are local-only: their changes are
  never synced. A received change to such a table, which only non-standard code
  can send, was still applied, overwriting the device's local data. It is now
  kept in quarantine, stored for sync but never applied.

- e270e42: Fixed declaration emit for exported Types

  Projects that emit declarations, such as libraries compiled with
  `declaration: true` or bundled with tsdown, failed with TS4023 when they
  exported an inferred Type or Type operation. For example,
  `export const Product = object({ tags: array(String), type: union("a", "b") })`
  referenced error interfaces that `@evolu/common` did not export, so TypeScript
  could not name them in the emitted declarations.

  Every interface that inferred Types and their `from` and `to` operations
  reference is now exported: `TransparentTypeError`, `FromParentOperations`,
  `ToParentOperations`, `UnionErrorValue`, `ArrayItemsErrorValue`,
  `ArrayFromParentOperations`, `SetItemsErrorValue`, `SetFromParentOperations`,
  `MapEntriesErrorValue`, `TupleItemsErrorValue`, `RootTupleType`,
  `RecordEntriesErrorValue`, `StrictObjectFromUnknownError`,
  `ObjectWithRecordReflection`, and `TemplateLiteralStringBrand`. Such
  declarations now emit without changes to the consuming code.

- f52d66b: Fixed schedules measuring elapsed time on the system clock

  Schedules computed how much time had passed from `Time.now`, which is Unix
  epoch time and follows system clock adjustments. A clock correction, such as an
  NTP sync after a device wakes, therefore changed how a running schedule behaved:
  a forward adjustment could reset a schedule that had just stepped, end a
  time-boxed one early, or collapse a compensated delay to zero, and a backward
  adjustment could keep a schedule running long past its limit.

  Elapsed time now comes from `Time.performance`, which measures elapsed time and
  is unaffected by clock adjustments. This applies to `elapsed`, `during`,
  `fixed`, `windowed`, `maxElapsed`, `compensate`, and `resetScheduleAfter`.
  Delays and outputs are unchanged; only the clock they are measured against is.

  The monotonic clock has its own limit: on platforms where it stops while the
  device sleeps, a suspended interval measures as little or no elapsed time, so
  `during` and `maxElapsed` outlive the wall-clock deadline they were given and
  `resetScheduleAfter` does not treat the sleep as inactivity.

- 11ccc28: Fixed stale Run state inside abort callbacks

  Abort callbacks could previously see their Run or shutting-down ancestors as
  `Running`, because state updates happened after callbacks executed.

  `Run.getState()` and `Run.snapshot()` now expose the abort request before
  descendant callbacks execute, and the observed abort before the Run's own
  callbacks execute.

  A recorded request does not mean the Run's signal has aborted: ancestors can
  still have `observed: null` during descendant callbacks, and abort masks can
  delay observation.

  Disposing an ancestor Run from an abort callback no longer emits duplicate
  `StateChanged` events for that Run.

- 2e139eb: Fixed timestamp counter overflow after the clock ran ahead of wall time

  When the 16-bit counter of a Hybrid Logical Clock timestamp is exhausted, the
  timestamp now advances the logical millisecond by one and resets the counter.
  The result is still checked against the five-minute drift limit, and rollover
  past the last representable time, in August 10889, throws.
  Previously, once the clock was ahead of wall time, for example after syncing
  with a device whose clock is fast, every local write shared one millisecond and
  a large batch failed with a counter overflow that left the write queue pending.

  `TimestampCounterOverflowError` was removed and is no longer a `TimestampError`
  or an `EvoluError`; remove any `case "TimestampCounterOverflowError"` from
  switches over these errors.

- 237fd7f: Fixed registrations of one owner with different access or transports

  Readonly and writable registrations for the same owner now retain their own capabilities and transport leases. Adding writable access starts synchronization even when readonly access already exists; removing the last writable registration stops synchronization while any readonly registrations keep their connections. Disposing an Evolu instance that used one owner through several transport sets now releases every set instead of failing on the second one.

- 2e139eb: Fixed writes stored twice after the tab hosting the database closed

  When the tab hosting the database closed or crashed while a write was in
  progress, Evolu retried the write in another tab with new timestamps. A write
  that had already been saved was then stored and synced again as a second change,
  and a retried write to a local-only table rewrote its `createdAt` or `updatedAt`
  with a later time. A retried write now reuses the timestamps and time of its
  first attempt, so it is stored once.

- 8e23edb: Made Type validation and construction faster

  Types validate with fewer allocations and less reflection while returning the
  same results, errors, issues, and messages. On the schemabenchmarks.dev Product
  schema, `fromUnknown` of valid data is about 2.8 times faster, and of invalid
  data about 5 times with the default first-error mode and 2.5 times with all
  errors. `is` is about 2.3 times faster for valid data and 3.3 times for invalid
  data, `~standard.validate` about 2.4 to 2.8 times, and creating the schema about
  5 times.

  Object keys are enumerated with `getOwnPropertyNames` and `getOwnPropertySymbols`
  instead of one `Reflect.ownKeys` call, so a Proxy's `ownKeys` trap can run more
  than once per validation. Type nodes have more internal symbol-keyed own
  properties. Bundles that use Types grow by about 0.1 to 1.6 KB brotli.

- fdac39e: Reported relay protocol version mismatches instead of dropping them

  A relay answers a request from another protocol version with only its version
  and the owner ID. The client rejected that reply as invalid data, so the
  mismatch was never reported. `parseProtocolHeader` now parses the version and
  owner ID of any version and reads the message type only for the supported one,
  and the reply is reported as `ProtocolVersionError` through `evoluError`.
  `ProtocolHeader.version` is a `NonNegativeInt` and `messageType` is optional.
  Direct callers must handle an absent `messageType` before using it.

  ```ts
  import {
    assertEqual,
    assertType,
    createBuffer,
    encodeNonNegativeInt,
    getOrThrow,
    NonNegativeInt,
  } from "@evolu/common";
  import {
    createProtocolMessageBuffer,
    MessageType,
    ownerIdToOwnerIdBytes,
    parseProtocolHeader,
    protocolVersion,
    testAppOwner,
    type ProtocolHeader,
  } from "@evolu/common/local-first";

  assertType<ProtocolHeader["version"], NonNegativeInt>();

  const readMessageType = (header: ProtocolHeader): MessageType | null => {
    // @ts-expect-error A parsed version is no longer restricted to the literal 1.
    const _oldVersion: 1 = header.version;
    // @ts-expect-error A different protocol version has no parsed message type.
    const _oldMessageType: MessageType = header.messageType;

    if (header.messageType === undefined) return null;
    return header.messageType;
  };

  // A version-mismatch reply contains only the version and owner ID.
  const otherVersion = NonNegativeInt.orThrow(protocolVersion + 1);
  const reply = createBuffer();
  encodeNonNegativeInt(reply, otherVersion);
  reply.extend(ownerIdToOwnerIdBytes(testAppOwner.id));
  const header = getOrThrow(parseProtocolHeader(reply.unwrap()));
  assertEqual(header.version, otherVersion);
  assertEqual(header.ownerId, testAppOwner.id);
  assertEqual(readMessageType(header), null);

  const request = createProtocolMessageBuffer(testAppOwner.id, {
    messageType: MessageType.Request,
  }).unwrap();
  assertEqual(
    readMessageType(getOrThrow(parseProtocolHeader(request))),
    MessageType.Request,
  );
  ```

## 8.10.0

### Minor Changes

- 532feaa: Added `ByteLength` with human-readable literals

  `ByteLength` is the canonical non-negative safe integer number of bytes, as
  `Millis` is for time. It rejects JavaScript's negative zero so zero has one
  canonical representation. `ByteSizeLiteral` validates sizes such as
  `"1023MiB"` or `"1.5GiB"` at compile time and runtime using the binary units
  `B`, `KiB`, `MiB`, `GiB`, and `TiB`. Each unit stays below 1024, so
  `1024KiB` is written as `"1MiB"`, and a half is the only decimal because it
  is the only one that is exact in every binary unit. APIs can accept `ByteSize` and normalize it with
  `byteSizeToByteLength`, and `ByteLengthFromString` parses either a number of
  bytes or a literal from text such as an environment variable.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    ByteLength,
    ByteLengthFromString,
    byteSizeToByteLength,
    type ByteSize,
  } from "@evolu/common";

  const quota: ByteSize = "1MiB";
  assertEqual(byteSizeToByteLength(quota), 1048576);
  assertEqual(byteSizeToByteLength(ByteLength.orThrow(1000)), 1000);
  assertErr(ByteLength.fromUnknown(-0));
  assertOk(ByteLengthFromString.fromUnknown("10MiB"), 10485760);
  ```

- 6bd0a36: Added strict environment configuration codecs

  Use `env({ ... })` to decode CONSTANT_CASE environment variables into typed
  camelCase settings. Declare fields directly for unprefixed variables such as
  `PORT`, and put related fields in one-level CONSTANT_CASE namespace groups
  such as `APP`. The decoded output stays flat. Duplicate output fields and
  external names fail during construction.

  TypeScript rejects fields declared as namespace groups and groups declared as
  fields. Full identifier spelling and name lengths are checked during construction.

  Field codecs validate values and encode them back to canonical strings. Field
  Types can use `withDefault` for explicit defaults. Resolve source precedence
  before replacing absence, or use the `preserve` strategy when later composition
  needs supplied-input evidence. Environment access and source merging remain
  application code.

  Unprefixed fields select exact names. Namespace groups select all names with
  their prefix and an underscore separator, ignoring casing during selection.
  Incorrectly cased or unknown selected names fail validation. Unrelated variables
  are ignored; misspelled unprefixed names or namespace prefixes may therefore
  still look absent. Namespaces must omit the trailing underscore.

  Optional fields may be absent; explicit `undefined` values are rejected.
  Empty strings remain present and must satisfy the field Type.
  Malformed and unknown selected names fail instead of silently using defaults.
  Errors retain the original environment names. Non-object inputs fail with
  standard object errors. Names follow `EnvName`: a
  CONSTANT_CASE identifier of at most 255 characters including the prefix.

  Matching own string properties are read from any non-null object, including
  arrays and `process.env`. Prototypes and internal contents, such as Map
  entries, are ignored. Missing required settings still fail validation.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    ByteLengthFromString,
    env,
    optional,
    PortFromString,
    typeErrorToIssues,
  } from "@evolu/common";

  const AppEnv = env({
    port: optional(PortFromString),
    APP: {
      maxOwnerBytes: optional(ByteLengthFromString),
    },
  });
  const config = AppEnv.fromUnknown({
    PORT: "04000",
    APP_MAX_OWNER_BYTES: "1MiB",
    HOME: "/home/evolu",
  });
  assertOk(config, { port: 4000, maxOwnerBytes: 1048576 });
  assertEqual(AppEnv.to(config.value), {
    PORT: "4000",
    APP_MAX_OWNER_BYTES: "1048576",
  });

  const invalid = AppEnv.fromUnknown({ APP_POTR: "4000" });
  assertErr(invalid);
  assertEqual(typeErrorToIssues(AppEnv, invalid.error)[0]?.path, ["APP_POTR"]);
  assertErr(AppEnv.fromUnknown({ PORT: "" }));
  assertErr(AppEnv.fromUnknown({ PORT: undefined }));
  assertOk(AppEnv.fromUnknown([]), {});
  ```

- f4d9ad7: Added custom error wrappers for validation Types

  `createTypeWithError` creates a root Type from an existing validator, an error
  mapper, and a formatter. It forwards error-collection options automatically.
  The source must use identity encoding; the wrapper preserves its valid values
  and exposes its Output as Input.

  ```ts
  import {
    assertEqual,
    assertErr,
    createTypeWithError,
    Number,
    String,
    union,
    type TypeError,
    type UnionError,
  } from "@evolu/common";

  interface ValueError extends TypeError<"Value"> {
    readonly cause: UnionError;
  }

  const Value = createTypeWithError(
    "Value",
    union(String, Number),
    (cause): ValueError => ({ type: "Value", cause }),
    () => "Enter text or a number.",
  );

  const result = Value.fromUnknown(false, { errors: "all" });
  assertErr(result);
  assertEqual(result.error.cause.errors.length, 2);
  assertEqual(Value.formatError(result.error), "Enter text or a number.");
  ```

- 3d84543: Added a prefixed string codec

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

- 6bd0a36: Added reversible object key codecs

  `objectKeys(keyType)(objectType)` gives a strict object's fields external
  names using the key Type's canonical encoding. Field Types, optionality, and
  semantic Output are preserved. Decoding accepts exact canonical names and
  reports errors at those names. Invalid schema keys and conflicting encodings
  fail during construction.

  Typed property errors include missing required properties and unexpected input
  keys.

  `CamelCaseIdentifierFromConstantCaseIdentifier` converts between the two
  identifier conventions without losing word boundaries. Compose it with
  `prefixed` to adapt namespaced keys.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    CamelCaseIdentifierFromConstantCaseIdentifier,
    object,
    objectKeys,
    PortFromString,
    prefixed,
  } from "@evolu/common";

  const Key = prefixed("APP_")(CamelCaseIdentifierFromConstantCaseIdentifier);
  const Settings = objectKeys(Key)(object({ http2Port: PortFromString }));
  const result = Settings.fromUnknown({ APP_HTTP2_PORT: "04000" });
  assertOk(result, { http2Port: 4000 });
  assertEqual(Settings.to(result.value), { APP_HTTP2_PORT: "4000" });
  assertErr(Settings.fromUnknown({ APP_HTTP_2_PORT: "4000" }));
  ```

- 76554bd: Added explicit defaults

  Use `withDefault(type, value)` to fill missing optional properties or accepted
  `null` and `undefined` values. Invalid supplied values still fail validation.

  Pass `{ strategy: "preserve" }` as the third argument to track whether the
  default was used and restore the original absence when encoding. An explicitly
  supplied value remains distinguishable even when it equals the default.

  Configured defaults are reused by reference, including when Types are localized
  with `localizeTypes`. `partial` retains localized field errors while disabling
  defaults for missing properties.

  **Prefer defaults in the view over defaults in your database schema.** Use
  nullable columns and apply `??` when reading or displaying values unless the
  default needs to be stored. Replacing `null` can enlarge rows unnecessarily and
  erase the distinction between "not specified" and an explicit user decision.

  ```ts
  import {
    assertEqual,
    assertOk,
    Boolean,
    nullOr,
    object,
    optional,
    withDefault,
  } from "@evolu/common";

  const Enabled = withDefault(nullOr(Boolean), true);

  assertOk(Enabled.fromUnknown(null), true);
  assertEqual(Enabled.to(true), true);

  const Settings = object({
    enabled: withDefault(optional(Boolean), true, { strategy: "preserve" }),
  });

  const missing = Settings.fromUnknown({});
  assertOk(missing, {
    enabled: { value: true, defaultUsed: true, original: "missing" },
  });
  assertEqual(Settings.to(missing.value), {});

  assertOk(Settings.fromUnknown({ enabled: true }), {
    enabled: { value: true, defaultUsed: false },
  });
  ```

- 918d77b: Added file system operations for Tasks

  `Fs` provides `readFile`, `writeFile`, `readDirectory`, `createDirectory`, `copy`,
  `copyFile`, `rename`, `remove`, `getMetadata`, `exists`, and `createTempDirectory`.
  Each operation returns a Task.

  Tasks can sequence file operations without synchronous I/O. Node.js's synchronous
  methods are intentionally omitted to avoid accidentally blocking the event loop.

  Inject `createNodeFs()` through `runMain` or `createRun`. Tasks declare `FsDep`
  and access the file system through `run.deps.fs`.

  On Node.js, `readFile` and `writeFile` pass the Run's abort signal to the native
  operation. If it rejects after cancellation, the Task propagates the Run's abort
  reason. Cancellation can leave a write partially completed. Successful operations
  return their values even if an abort was requested. Other operations run to
  completion and return their results once started.

  File system errors include a reason such as `NotFound` or `IsDirectory`, a
  diagnostic message, and the operation's path. URL paths are represented by `href`.
  Copy and rename errors also include the destination. `exists` returns `false`
  for `NotFound` and preserves other errors, including permission failures.

  `getMetadata` returns data with a `type` field such as `"File"` or `"Directory"`.
  `readDirectory` lists relative entry names and supports recursive listing.
  On Node.js, `copy` delegates to recursive `node:fs/promises.cp`. By default it
  merges directories and replaces files. Its options are Node's `force`,
  `errorOnExist`, and `preserveTimestamps`: `force: false` skips existing files,
  and adding `errorOnExist: true` rejects existing files and directories.
  Symbolic links retain Node's behavior and may still be replaced with both of
  those options set. Tree copying provides no exclusive-creation or atomicity
  guarantee, and a failure can leave a partial copy.

  `copyFile` copies a single file and fails with `AlreadyExists` if the destination
  exists, unless `overwrite: true` is set. Its default exclusive creation also
  protects against competing copies. File contents are not published atomically.
  `rename` uses the platform's rename semantics and can replace an existing file.

  `createTempDirectory()` uses the system temporary directory by default. Its
  `directory` option selects an existing parent directory, and `prefix` sets a
  prefix for the generated directory name. The returned directory supports cleanup
  with `await using`. Once creation starts, it returns its result even if the Run
  aborts, so the caller can dispose the directory.
  On Node.js, the parent is resolved through the file system before creation, so
  symbolic links followed by `..` retain their file system meaning. The returned
  path is absolute, so cleanup still removes the created directory if the process
  changes its working directory before disposal. Resolution errors identify the
  supplied parent; creation errors identify the resolved parent and name prefix.

  ```ts
  import {
    assertEqual,
    assertErr,
    ok,
    type FsDep,
    type FsError,
    type Task,
  } from "@evolu/common";
  import { createNodeFs, runMain } from "@evolu/nodejs";
  import { join } from "node:path";

  const main: Task<void, FsError, FsDep> = async (run) => {
    const { fs } = run.deps;
    const temp = await run(fs.createTempDirectory({ prefix: "evolu-fs-" }));
    if (!temp.ok) return temp;

    await using directory = temp.value;
    const path = join(directory.path, "message.txt");

    const result = await run(fs.writeFile(path, "hello"));
    if (!result.ok) return result;

    const text = await run(fs.readFile(path, "utf8"));
    if (!text.ok) return text;
    assertEqual(text.value, "hello");

    const metadata = await run(fs.getMetadata(path));
    if (!metadata.ok) return metadata;
    assertEqual(metadata.value.type, "File");

    const copyPath = join(directory.path, "copy.txt");
    const copied = await run(fs.copy(path, copyPath));
    if (!copied.ok) return copied;
    const copyConflict = await run(
      fs.copy(path, copyPath, { force: false, errorOnExist: true }),
    );
    assertErr(copyConflict);
    assertEqual(copyConflict.error.reason, "AlreadyExists");

    const conflict = await run(fs.copyFile(path, copyPath));
    assertErr(conflict);
    assertEqual(conflict.error.reason, "AlreadyExists");

    return ok();
  };

  await runMain({ fs: createNodeFs() }, { mode: "command" })(main);
  ```

  Use `testCreateFs(overrides)` to supply file system behavior in application tests.
  Unconfigured operations throw a defect naming the method when their Task runs.

  ```ts
  import {
    assertErr,
    testCreateFs,
    testCreateRun,
    err,
    type FsError,
  } from "@evolu/common";

  const error: FsError = {
    type: "FsError",
    reason: "PermissionDenied",
    path: "protected.txt",
    syscall: "open",
    message: "Permission denied",
  };

  await using run = testCreateRun({
    fs: testCreateFs({ readFile: () => () => err(error) }),
  });

  assertErr(await run(run.deps.fs.readFile("protected.txt", "utf8")), error);
  ```

- f4d9ad7: Included member failures in union validation messages

  Union messages now include the retained member failures below the summary.
  This makes errors from Types such as `undefinedOr(PortFromString)` actionable
  without inspecting an Error's `cause`. Validation, encoding, and structured
  errors are unchanged. A Union still produces one issue at its enclosing path;
  member indexes and nested paths appear only in the message.

  **Custom `Union` formatters now provide the summary, not the complete message.**
  Remove any member-error enumeration from those formatters: Evolu appends the
  details using the member formatters in the selected locale. Update exact
  message assertions and allow multiline messages wherever validation errors are
  displayed. Calling a locale's `formatUnionError` directly still returns only
  the summary; use the Type's `formatError` to format the complete failure.

  Only failures retained during decoding can be reported. The default keeps the
  first member failure; `{ errors: "all" }` retains every failed alternative.
  Formatting does not run validation again.

  ```ts
  import {
    assertEqual,
    assertErr,
    PortFromString,
    typeErrorToIssues,
    undefinedOr,
  } from "@evolu/common";

  const Port = undefinedOr(PortFromString);
  const result = Port.fromUnknown("65536");
  assertErr(result);

  const message = [
    "A value does not match any allowed variant.",
    "- 0: PortFromString: The value 65536 must be less than or equal to 65535.",
  ].join("\n");

  assertEqual(Port.formatError(result.error), message);
  assertEqual(typeErrorToIssues(Port, result.error), [{ path: [], message }]);
  ```

- 6bd0a36: Added descriptor-preserving object key filtering

  Use `filterObjectKeys` to select own string-keyed properties without reading
  their values or invoking getters. It preserves property descriptors, including
  non-enumerable properties, and ignores inherited and symbol properties. The
  result is a new ordinary object whose declared properties are optional and readonly.

  ```ts
  import { assertEqual, assertType, filterObjectKeys } from "@evolu/common";

  const selected = filterObjectKeys(
    { APP_PORT: "4000", HOME: "/home/evolu" },
    (key) => key.startsWith("APP_"),
  );
  assertEqual(selected, { APP_PORT: "4000" });
  assertType<
    typeof selected,
    { readonly APP_PORT?: string; readonly HOME?: string }
  >();
  ```

- ad85bdb: Gave duration and percentage literals dedicated validation errors

  `DurationLiteral` and `PercentageLiteral` now report `DurationLiteralError` and
  `PercentageLiteralError` instead of generic union errors. Each error retains
  the rejected `value` and the underlying union failure in `cause`, while its
  default message gives examples of the expected format.

  Validation options still apply to the underlying unions: `{ errors: "all" }`
  retains every alternative in `cause`, while formatting remains concise.

  Every locale exports `formatDurationLiteralError` and
  `formatPercentageLiteralError`. Use the matching `DurationLiteral` and
  `PercentageLiteral` keys when localizing these Types or enclosing schemas.

  These are now named Types rather than exposed unions, so they no longer expose
  `.members`. Duration unit Types still expose their members. Use `fromUnknown`
  for dynamic input; the typed `from`, `to`, and `orThrow` methods require a valid
  literal.

  ```ts
  import {
    assertEqual,
    assertErr,
    DurationLiteral,
    PercentageLiteral,
    localizeTypes,
    object,
  } from "@evolu/common";
  import { cs } from "@evolu/common/intl";

  const duration = DurationLiteral.fromUnknown("60s", { errors: "all" });
  assertErr(duration);

  // @ts-expect-error DurationLiteral errors have type "DurationLiteral", not "Union".
  const _oldDurationTag: "Union" = duration.error.type;
  assertEqual(duration.error.type, "DurationLiteral");
  assertEqual(duration.error.cause.type, "Union");
  assertEqual(duration.error.cause.errors.length, 7);

  const percentage = PercentageLiteral.fromUnknown("101%", { errors: "all" });
  assertErr(percentage);

  // @ts-expect-error PercentageLiteral errors have type "PercentageLiteral", not "Union".
  const _oldPercentageTag: "Union" = percentage.error.type;
  assertEqual(percentage.error.type, "PercentageLiteral");
  assertEqual(percentage.error.cause.type, "Union");
  assertEqual(percentage.error.cause.errors.length, 4);

  const { czech } = localizeTypes(
    { Settings: object({ delay: DurationLiteral, jitter: PercentageLiteral }) },
    {
      czech: {
        Object: cs.formatObjectError,
        DurationLiteral: cs.formatDurationLiteralError,
        PercentageLiteral: cs.formatPercentageLiteralError,
      },
    },
  );
  const invalid = czech.Settings.fromUnknown({ delay: "60s", jitter: "50%" });
  assertErr(invalid);
  assertEqual(
    czech.Settings.formatError(invalid.error),
    'Hodnota "60s" není literál délky trvání. Použijte hodnotu jako "500ms" nebo "1.5s".',
  );
  ```

- f4d9ad7: Added validation issues with paths

  Use `typeErrorToIssues(type, error)` to convert a Type validation error into a
  non-empty array of `TypeIssue` values. Each issue contains a `path` from the
  root value and a formatted `message`. Nested and localized formatters are
  preserved; root errors have an empty path.

  Pass the Type that produced the error. The helper does not validate again, so
  decode with `{ errors: "all" }` to collect every issue.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertType,
    BooleanFromString,
    object,
    PortFromString,
    typeErrorToIssues,
    type NonEmptyReadonlyArray,
    type TypeIssue,
  } from "@evolu/common";

  const Settings = object({
    server: object({ port: PortFromString }),
    enabled: BooleanFromString,
  });
  const result = Settings.fromUnknown(
    { server: { port: "65536" }, enabled: "maybe" },
    { errors: "all" },
  );
  assertErr(result);

  const issues = typeErrorToIssues(Settings, result.error);
  assertType<typeof issues, NonEmptyReadonlyArray<TypeIssue>>();
  assertEqual(issues, [
    {
      path: ["server", "port"],
      message: "The value 65536 must be less than or equal to 65535.",
    },
    {
      path: ["enabled"],
      message: 'The value "maybe" is not a boolean. Use true or false.',
    },
  ]);
  ```

- 91ff875: Added Port and PortFromString

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

- 6bd0a36: Exposed reusable Type factory declarations

  `ValidateLiteral` is now exported for factories that require one concrete
  literal parameter. It preserves exact literals and rejects widened, union,
  branded, and open template literal types at compile time.

  `ValidateOutput` is also exported for factories that require one concrete Type
  node. It rejects TypeScript unions of Type nodes while accepting a `union` Type.

  `EnvType<Props>` names the configuration codec returned by `env`, including
  its flat output and grouped field declarations.

  ```ts
  import {
    assertEqual,
    assertType,
    env,
    object,
    PortFromString,
    type AnyType,
    type EnvType,
    type ValidateLiteral,
    type ValidateOutput,
  } from "@evolu/common";

  const definePrefix = <Prefix extends string>(
    prefix: Prefix & ValidateLiteral<Prefix>,
  ): Prefix => prefix;

  const prefix = definePrefix("APP");
  assertType<typeof prefix, "APP">();
  const widened: string = "APP";
  // @ts-expect-error Expected must be one concrete literal value.
  definePrefix(widened);

  const Settings = object({ port: PortFromString });
  const defineOutput = <T extends AnyType>(type: T & ValidateOutput<T>): T =>
    type;
  const Output = defineOutput(Settings);
  assertType<typeof Output, typeof Settings>();
  const uncertain = Settings as typeof Settings | typeof PortFromString;
  // @ts-expect-error Output Type must be one concrete Type node. Pass a Union Type node instead of a union of Type nodes.
  defineOutput(uncertain);

  const Env = env({ [prefix]: Output.props });
  assertType<typeof Env, EnvType<{ readonly APP: typeof Settings.props }>>();
  assertEqual(Env.orThrow({ APP_PORT: "4000" }), { port: 4000 });
  ```

- 140c4cf: Added `IntFromString` and `BooleanFromString`

  Both Types parse text inputs such as environment variables, URL query
  parameters, and form fields. `IntFromString` accepts an optional minus sign
  and digits within the safe integer range and preserves JavaScript's negative
  zero. `BooleanFromString` accepts exactly `true` and `false`, so a boolean
  has one spelling in every source. Both errors have localized messages in
  every `@evolu/common/intl` locale.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    assertSame,
    BooleanFromString,
    IntFromString,
  } from "@evolu/common";

  assertOk(IntFromString.fromUnknown("4000"), 4000);
  assertErr(IntFromString.fromUnknown("4000.5"), {
    type: "IntFromString",
    value: "4000.5",
  });
  const negativeZero = IntFromString.orThrow("-0");
  assertSame(negativeZero, -0);
  assertEqual(IntFromString.to(negativeZero), "-0");
  assertOk(BooleanFromString.fromUnknown("true"), true);
  assertErr(BooleanFromString.fromUnknown("yes"), {
    type: "BooleanFromString",
    value: "yes",
  });
  ```

- 3d84543: Added a startsWith string Brand factory

  Use `startsWith(prefix)(String)` to require an exact, case-sensitive prefix
  without changing the string. Compose it with other string Types to preserve
  their constraints. Each literal prefix produces a distinct brand; an empty
  prefix accepts every string allowed by the parent Type.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    assertType,
    maxLength,
    startsWith,
    String,
    type Brand,
  } from "@evolu/common";

  const EnvName = startsWith("APP_")(maxLength(64)(String));
  const result = EnvName.fromUnknown("APP_PORT");
  assertOk(result, "APP_PORT");
  assertType<
    typeof result.value,
    string & Brand<"MaxLength64"> & Brand<"StartsWithAPP_">
  >();
  assertEqual(EnvName.to(result.value), "APP_PORT");
  assertErr(EnvName.fromUnknown("app_PORT"));

  const prefix = globalThis.String("APP_");
  // @ts-expect-error Expected must be one concrete literal value.
  startsWith(prefix);
  ```

  All 43 locales export `formatStartsWithError` for use with `localizeTypes`.
  Messages include the value and required prefix, with quotes and control
  characters escaped.

  ```ts
  import {
    assertEqual,
    assertErr,
    localizeTypes,
    startsWith,
    String,
  } from "@evolu/common";
  import { cs } from "@evolu/common/intl";

  const EnvName = startsWith("APP_")(String);
  const localized = localizeTypes(
    { EnvName },
    {
      cs: {
        [EnvName.name]: cs.formatStartsWithError,
        String: cs.formatStringError,
      },
    },
  );
  const result = localized.cs.EnvName.fromUnknown("PORT");
  assertErr(result);
  assertEqual(
    localized.cs.EnvName.formatError(result.error),
    'Hodnota "PORT" musí začínat na "APP_".',
  );
  ```

- 3d84543: Added identifier Types and casing conversions

  Validate identifiers with `CamelCaseIdentifier`, `PascalCaseIdentifier`,
  `SnakeCaseIdentifier`, `KebabCaseIdentifier`, or `ConstantCaseIdentifier`, and
  convert between them with functions such as `constantCaseToCamelCase`, which
  turns `HTTP2_PORT` into `http2Port`. Conversions preserve word boundaries, so
  converting back restores the original spelling.

  An identifier is one or more ASCII words, each starting with a letter and
  continuing with letters or digits. Every uppercase letter in camelCase and
  PascalCase starts a word: `httpUrl` corresponds to `HTTP_URL`, while `httpURL`
  corresponds to `HTTP_U_R_L`. Words never start with a digit, because camelCase
  cannot mark a word boundary before one. Join an abbreviation such as `2FA` to
  the previous word, as in `MAX2FA_ATTEMPTS` and `max2faAttempts`, or spell the
  number out, as in `TWO_FACTOR_SECRET`.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    assertType,
    camelCaseToConstantCase,
    constantCaseToCamelCase,
    CamelCaseIdentifier,
    ConstantCaseIdentifier,
  } from "@evolu/common";

  const input = ConstantCaseIdentifier.fromUnknown("HTTP2_PORT");
  assertOk(input);
  const camel = constantCaseToCamelCase(input.value);
  assertEqual(camel, "http2Port");
  assertType<typeof camel, CamelCaseIdentifier>();

  const constant = camelCaseToConstantCase(camel);
  assertEqual(constant, input.value);
  assertType<typeof constant, ConstantCaseIdentifier>();

  assertErr(ConstantCaseIdentifier.fromUnknown("HTTP_2_PORT"));
  assertErr(CamelCaseIdentifier.fromUnknown("http_port"));

  assertErr(ConstantCaseIdentifier.fromUnknown("MAX_2FA_ATTEMPTS"));
  const attempts = ConstantCaseIdentifier.orThrow("MAX2FA_ATTEMPTS");
  assertEqual(constantCaseToCamelCase(attempts), "max2faAttempts");
  assertErr(ConstantCaseIdentifier.fromUnknown("2FA_SECRET"));
  const secret = ConstantCaseIdentifier.orThrow("TWO_FACTOR_SECRET");
  assertEqual(constantCaseToCamelCase(secret), "twoFactorSecret");
  ```

  Use the `identifier` Brand factory to add these rules to an existing string
  Type, for example `identifier("CONSTANT_CASE")(maxLength(64)(String))`.
  Conversions return only the destination brand, since changing the spelling can
  invalidate other constraints such as length. `formatIdentifierError` is
  available in every supported locale.

- f3b5829: Added text casing Types and conversion functions

  Check and change text casing with Types that work directly with TypeScript's
  built-in string casing types. Use `CapitalizedString`, `UncapitalizedString`,
  `UppercasedString`, and `LowercasedString` to validate input without changing it.
  Use `capitalize`, `uncapitalize`, `uppercase`, and `lowercase` to create a value
  with the desired casing from any string. When the input is a string literal,
  TypeScript infers the exact converted value.

  Capitalization changes the first Unicode code point and keeps the rest of the
  text intact. Uppercasing and lowercasing apply to the whole string. Empty strings
  stay empty, and characters without casing, such as digits and emoji, are allowed.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertOk,
    assertType,
    capitalize,
    CapitalizedString,
    lowercase,
    LowercasedString,
    uncapitalize,
    UncapitalizedString,
    uppercase,
    UppercasedString,
  } from "@evolu/common";

  const title: CapitalizedString = "Hello world";
  assertOk(CapitalizedString.fromUnknown(title), title);
  assertErr(CapitalizedString.fromUnknown("hello world"));
  const greeting = capitalize("hello world");
  assertType<typeof greeting, "Hello world">();
  assertEqual(greeting, title);
  assertEqual(uncapitalize("Hello WORLD"), "hello WORLD");
  assertEqual(uppercase("Hello world"), "HELLO WORLD");
  assertEqual(lowercase("Hello WORLD"), "hello world");

  assertType<CapitalizedString, Capitalize<string>>();
  assertType<UncapitalizedString, Uncapitalize<string>>();
  assertType<UppercasedString, Uppercase<string>>();
  assertType<LowercasedString, Lowercase<string>>();

  assertEqual(capitalize("𐐨x"), "𐐀x");
  assertEqual(uppercase("Straße"), "STRASSE");
  assertEqual(lowercase(""), "");
  ```

  Apply `capitalized`, `uncapitalized`, `uppercased`, or `lowercased` to an existing
  string Type to retain its constraints during validation. The conversion
  functions return the corresponding intrinsic type without retaining input
  brands: Unicode casing can change the length, as `ß` becomes `SS`.

  Error formatters for the new Types are available in every supported locale.

- ad85bdb: Gave byte-size literals a dedicated validation error

  `ByteSizeLiteral` now reports `ByteSizeLiteralError` instead of `UnionError`.
  Its message explains the expected format without expanding every union
  alternative. The rejected value is in `value`, and `cause` retains the
  underlying union failure for diagnostics. Accepted literals and encoding are
  unchanged.

  Validation options still apply to the underlying union: `{ errors: "all" }`
  retains every alternative in `cause`, while formatting remains concise.

  Use the `ByteSizeLiteral` localization key and `formatByteSizeLiteralError`,
  available in every locale. Localizing an enclosing Type now selects this
  formatter independently of generic union messages.

  Code inspecting the old error must use the new tag and read union diagnostics
  from `cause`. `ByteSizeLiteral` is now a named Type rather than an exposed union;
  the unit-specific Types remain available separately.

  ```ts
  import {
    assertEqual,
    assertErr,
    ByteSizeLiteral,
    localizeTypes,
    object,
  } from "@evolu/common";
  import { cs } from "@evolu/common/intl";

  const invalid = ByteSizeLiteral.fromUnknown("1MB", { errors: "all" });
  assertErr(invalid);

  // @ts-expect-error ByteSizeLiteral errors have type "ByteSizeLiteral", not "Union".
  const _oldTag: "Union" = invalid.error.type;
  assertEqual(invalid.error.type, "ByteSizeLiteral");
  assertEqual(invalid.error.cause.type, "Union");
  assertEqual(invalid.error.cause.errors.length, 5);

  const { czech } = localizeTypes(
    { Settings: object({ quota: ByteSizeLiteral }) },
    {
      czech: {
        Object: cs.formatObjectError,
        ByteSizeLiteral: cs.formatByteSizeLiteralError,
      },
    },
  );
  const result = czech.Settings.fromUnknown({ quota: "1MB" });
  assertErr(result);
  assertEqual(
    czech.Settings.formatError(result.error),
    'Hodnota "1MB" není literál velikosti v bajtech. Použijte hodnotu jako "512KiB" nebo "1MiB".',
  );
  ```

### Patch Changes

- ad85bdb: Reduced generated declarations for literal Types

  Byte-size, duration, percentage, and digit-range declarations now preserve
  references to shared Types instead of repeatedly expanding their definitions.
  Accepted values and the unit Types' member and template-part APIs are preserved.

  ```ts
  import {
    assertSame,
    assertType,
    ByteSizeLiteralKiB,
    Digit1To9,
    Digit1To59,
    DurationLiteralSeconds,
  } from "@evolu/common";

  assertSame(ByteSizeLiteralKiB.members[0].parts[0], Digit1To9);
  assertType<(typeof ByteSizeLiteralKiB.members)[5]["parts"][1], ".5KiB">();
  assertSame(DurationLiteralSeconds.members[0].parts[0], Digit1To59);
  ```

- f4d9ad7: Improved Type.orThrow validation messages

  `Type.orThrow` now throws an `Error` whose message comes from the Type's
  `formatError`, including localized formatters. The original validation error
  remains available in `cause`. With `{ errors: "all" }`, the cause retains all
  collected errors while the message describes the first issue.

  Typed-input assertion failures retain their existing messages. The generic
  `getOrThrow` function is unchanged.

  ```ts
  import {
    assertEqual,
    assertErr,
    assertInstanceOf,
    PortFromString,
    trySync,
  } from "@evolu/common";

  assertEqual(PortFromString.orThrow("4000"), 4000);

  const failed = trySync(() => PortFromString.orThrow("http"));
  assertErr(failed);
  assertInstanceOf(failed.error, Error);
  assertEqual(
    failed.error.message,
    'The value "http" is not a decimal integer.',
  );
  assertEqual(failed.error.cause, { type: "IntFromString", value: "http" });
  ```

- 9ee6f15: Translated the Ukrainian error messages

  The `uk` locale in `@evolu/common/intl` formatted every Type error in
  English. All messages are now in Ukrainian.

## 8.9.0

### Minor Changes

- 24ee6b0: Exported the Promise continuation timing assertion

  Added `assertContinuationAfterMicrotasks` for tests that intentionally pin the
  exact number of microtasks before a continuation attached to a Promise runs
  after fulfillment or rejection.

  ```ts
  import { assertContinuationAfterMicrotasks } from "@evolu/common";

  await assertContinuationAfterMicrotasks(Promise.resolve("ready"), 1);
  ```

## 8.8.0

### Minor Changes

- 91ff2c9: Improved boolean assertion narrowing

  `assertTrue` now preserves TypeScript control-flow narrowing when passed a
  boolean condition. Type guards therefore narrow their original value after the
  assertion, while unknown values continue to be checked against exact `true`.

  ```ts
  import { assertEqual, assertTrue, assertType } from "@evolu/common";

  const value: unknown = "Evolu";
  const isString = (value: unknown): value is string =>
    typeof value === "string";

  assertTrue(isString(value));
  assertType<typeof value, string>();
  assertEqual(value.toUpperCase(), "EVOLU");
  ```

- 468b824: Expanded platform-agnostic assertions

  Added `assertEqualBytes`, `assertConditionAfterMicrotasks`, `assertInstanceOf`,
  `assertLength`, `assertNotSame`, `assertNotEqual`, `assertThrows`,
  `assertThrowsSame`, `assertThrowsInstanceOf`, `assertRejects`,
  `assertRejectsSame`, and `assertRejectsInstanceOf` for portable invariants,
  examples, and tests. `assertEqualBytes` compares a `Uint8Array` with expected
  bytes from any numeric array-like representation.
  `assertThrows` and `assertRejects` require either an expected value, compared
  using Evolu equality, or an assertion function for custom verification. The
  `Same` variants verify exact propagation, while the `InstanceOf` variants
  return the narrowed failure for further inspection.

  `assertEqual` and `assertNotEqual` now accept unknown values. Data
  representations use Evolu's deep equality semantics, while unsupported values
  are opaque and compare by identity. The default comparisons in `assertOk` and
  `assertErr` use the same behavior.

  Evolu assertions now throw `AssertionError`-compatible errors with structured
  failure details. Node.js uses its native `AssertionError`, including diffs for
  comparison assertions, while browsers and React Native use a compatible
  fallback. `assert` also accepts optional structured diagnostics, including an
  underlying error's cause.

  ```ts
  import {
    assert,
    assertEqual,
    assertEqualBytes,
    assertErr,
    assertInstanceOf,
    assertLength,
    assertNotEqual,
    assertRejectsInstanceOf,
    assertSame,
    assertThrows,
    trySync,
  } from "@evolu/common";

  const actual: unknown = { name: "Ada" };
  assertNotEqual(actual, { name: "Grace" });
  assertLength(["Ada", "Grace"], 2);
  assertEqualBytes(new Uint8Array([1, 2, 3]), [1, 2, 3]);

  const cause = new Error("Unexpected value.");
  assertThrows(() => {
    throw cause;
  }, cause);

  const rejection = await assertRejectsInstanceOf(
    Promise.reject(new TypeError("Unavailable.")),
    TypeError,
  );
  assertEqual(rejection.message, "Unavailable.");

  const result = trySync(() => assert(false, "Expected true.", { cause }));

  assertErr(result);
  assertInstanceOf(result.error, Error);
  assertSame(result.error.cause, cause);
  ```

- 57217a0: Added disposable global test stubs

  Added `testStubGlobal` for temporarily replacing a global property and restoring
  its original descriptor with `using`.

  ```ts
  import { assertEqual, assertFalse, testStubGlobal } from "@evolu/common";

  const key = Symbol("test global");
  {
    using _stub = testStubGlobal(key, 42);
    assertEqual(Reflect.get(globalThis, key), 42);
  }
  assertFalse(Reflect.has(globalThis, key));
  ```

- 0be94d0: Exposed binary codec helpers

  Added public Buffer helpers for encoding numbers, flags, non-negative integers,
  lengths, strings, and run-length encoded values.

  ```ts
  import {
    assertEqual,
    createBuffer,
    decodeString,
    encodeString,
  } from "@evolu/common";

  const buffer = createBuffer();
  encodeString(buffer, "Evolu");

  assertEqual(decodeString(createBuffer(buffer.unwrap())), "Evolu");
  ```

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

- 468b824: Distinguished positive and negative zero in equality

  `eqNumber` and `eqData` now compare primitive values with `Object.is`,
  JavaScript's SameValue algorithm. Therefore number and Data equality,
  `assertEqual`, and the default comparisons in `assertOk` and `assertErr`
  distinguish `0` from `-0` while still considering `NaN` equal to itself.
  Structural lookup keys also preserve the distinction between `0` and `-0`.

  ```ts
  import {
    assertFalse,
    eqData,
    eqNumber,
    structuralLookup,
  } from "@evolu/common";

  assertFalse(eqNumber(0, -0));
  assertFalse(eqData({ value: 0 }, { value: -0 }));
  assertFalse(structuralLookup(0) === structuralLookup(-0));
  ```

- 468b824: Corrected SameValue equality helper names

  Renamed `eqStrict` to `eqSameValue` and `eqArrayStrict` to `eqArraySameValue`.
  Their SameValue behavior through `Object.is` is unchanged.

  ```ts
  import {
    assertFalse,
    assertTrue,
    eqArraySameValue,
    eqSameValue,
  } from "@evolu/common";

  assertTrue(eqSameValue(NaN, NaN));
  assertFalse(eqSameValue(0, -0));
  assertFalse(eqArraySameValue([{}], [{}]));
  ```

## 8.7.0

### Minor Changes

- f9257a7: Added `encodeJsonValue` and `decodeJsonValue` for binary serialization

  The codec is inspired by msgpackr and reuses its test cases and benchmark workloads. It supports only `JsonValue`, because Evolu Protocol is Evolu's own binary serialization format and needs MessagePack only to avoid reinventing binary JSON serialization. This narrower scope allowed us to make the codec faster and smaller. We also fixed three bugs.

  - Small mixed object: Evolu is 15% faster at encoding and 28% faster at decoding
    than msgpackr 2.0.5.
  - Large nested object: Evolu is 4% slower at encoding and 8% faster at decoding
    than msgpackr 2.0.5.
  - Minified browser bundle: Evolu is 76% smaller than msgpackr 2.0.5 (2.6 kB
    versus 10.5 kB gzip).

  The three fixes prevent round-trip failures and losses: encoding and decoding now enforce the same nesting limit, negative zero no longer becomes `0`, and an own `__proto__` JSON object key no longer becomes `__proto_`.

  The Evolu Protocol now uses these functions for JSON values and finite numbers
  instead of msgpackr, removing the msgpackr runtime dependency while preserving MessagePack compatibility.

  The codec supports up to 1,000 nested arrays or objects. Encoding and decoding
  enforce the same limit so every successfully encoded value can be decoded.

  ```ts
  import {
    assertEqual,
    createBuffer,
    decodeJsonValue,
    encodeJsonValue,
    getOrThrow,
    JsonValue,
  } from "@evolu/common";

  const buffer = createBuffer();
  const value = getOrThrow(
    JsonValue.fromUnknown({ name: "Ada", scores: [10, 20] }),
  );

  encodeJsonValue(buffer, value);

  assertEqual(decodeJsonValue(buffer), value);
  ```

## 8.6.2

### Patch Changes

- c9b0c0d: Restricted SQLite values to finite numbers

  `SqliteValue`, schema columns, SQL parameters, mutations, query parameters, and synchronized changes now reject `NaN`, `Infinity`, and `-Infinity`. This prevents SQLite and query serialization from silently changing non-finite values.

  Use `FiniteNumber` or a narrower finite Type instead of unrestricted `Number` for SQLite-backed values.

  ```ts
  import {
    assertFalse,
    assertType,
    FiniteNumber,
    Number,
    SqliteValue,
    type SqliteValue as SqliteValueType,
  } from "@evolu/common";

  const unrestrictedNumber = Number.orThrow(1);
  // @ts-expect-error A Number can contain non-finite values and is not assignable to SqliteValue.
  const _oldValue: SqliteValueType = unrestrictedNumber;

  const finiteNumber = FiniteNumber.orThrow(1);
  const _sqliteValue: SqliteValueType = finiteNumber;
  assertType<FiniteNumber, typeof finiteNumber>();
  assertFalse(SqliteValue.is(Infinity));
  ```

  When using another Standard Schema library, its inferred numeric output must be assignable to `FiniteNumber`. The library can perform the runtime validation itself and brand the validated output compatibly. For example, Zod 4's `number` validator rejects non-finite numbers but still infers `number`, so adapt its output after validation:

  ```ts
  import * as z from "zod";
  import { assertType, type FiniteNumber } from "@evolu/common";

  // Zod 4 numbers are finite by default; Evolu Type Number models all JavaScript numbers.
  const ZodFiniteNumber = z
    .number()
    .transform((value): FiniteNumber => value as FiniteNumber);

  assertType<FiniteNumber, z.output<typeof ZodFiniteNumber>>();
  ```

  By the way, this is one of the reasons Evolu Type exists: it favors stricter defaults, and every constraint is automatically reflected in the output type as a brand.

## 8.6.1

### Patch Changes

- 9e71ebd: Fixed synchronization of nullable column updates

  Setting a nullable column to `null` now synchronizes across devices instead of
  throwing an assertion error.

## 8.6.0

### Minor Changes

- 076dc42: Added `assertEqual`, `assertSame`, `assertTrue`, and `assertFalse`

  `assertEqual` compares platform-independent Data with `eqData` and reports an
  assertion failure when the values differ. `assertSame` compares any JavaScript
  values with SameValue semantics through `eqStrict`, including object reference
  identity. `assertTrue` and `assertFalse` require exact boolean values instead of
  truthiness or falsiness. These assertions are useful in portable examples where
  an invariant-specific assertion message would add noise.

  ```ts
  import {
    assertEqual,
    assertFalse,
    assertSame,
    assertTrue,
  } from "@evolu/common";

  assertEqual(
    new Map([["roles", new Set(["admin", "author"])]]),
    new Map([["roles", new Set(["author", "admin"])]]),
  );

  const scores = [100, 80];
  const leaderboard = scores;
  assertSame(leaderboard, scores);

  assertTrue(scores.length === 2);
  assertFalse(scores.length === 0);
  ```

- 420b03e: Added `eqUint8Array`

  Use `eqUint8Array` to compare two Uint8Arrays by byte value.

  ```ts
  import { assertTrue, eqUint8Array } from "@evolu/common";

  assertTrue(eqUint8Array(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  ```

- 420b03e: Added the `map` Type Factory

  `map(Key, Value)` validates JavaScript Maps and their entries while
  preserving the original Map when decoding does not change any key or value.
  Own properties are rejected. If distinct input keys decode to the same output
  key, validation returns a collision error instead of discarding an associated
  value.

  Every locale exported by `@evolu/common/intl` provides `formatMapError` for
  localized structural Map errors. Key and value errors use their respective Type
  formatters.

  ```ts
  import {
    PositiveInt,
    String,
    assertOk,
    assertSame,
    map,
  } from "@evolu/common";

  const Scores = map(String, PositiveInt);
  const scores = new Map([
    ["Ada", 10],
    ["Grace", 20],
  ]);

  const result = Scores.fromUnknown(scores);

  assertOk(result);
  assertSame(result.value, scores);
  ```

- 420b03e: Added `assertOk`, `assertErr`, `IsSameType`, and exact `assertType`

  These platform-independent assertions can be used in tests, documentation
  examples, and application code without depending on a test framework.

  `assertOk` and `assertErr` assert and narrow a Result variant. With an expected
  value or error, they compare it using `eqData`; values outside Data require an
  explicit `Eq`. Expected Data is inferred independently, so unbranded literals
  can compare primitive-branded Result values. Without an expected value, they
  leave the narrowed value or error available for a separate assertion.

  `IsSameType<A, B>` exposes exact type equality as a boolean type.
  `assertType<Expected, Actual>()` uses that comparison and requires a
  `CompileTimeError` argument when the types differ.

  ```ts
  import {
    assertErr,
    assertOk,
    assertType,
    err,
    ok,
    type Err,
    type IsSameType,
    type Ok,
    type Result,
  } from "@evolu/common";

  interface ValuesNotFoundError {
    readonly type: "ValuesNotFound";
  }

  const success: Result<ReadonlyArray<number>, ValuesNotFoundError> = ok([
    1, 2,
  ]);
  assertOk(success, [1, 2]);
  assertType<Ok<ReadonlyArray<number>>, typeof success>();

  const failure: Result<ReadonlyArray<number>, ValuesNotFoundError> = err({
    type: "ValuesNotFound",
  });
  assertErr(failure, { type: "ValuesNotFound" });
  assertType<Err<ValuesNotFoundError>, typeof failure>();

  const status = "ready" as const;
  assertType<true, IsSameType<typeof status, "ready">>();

  // `satisfies` checks assignability, so a narrower literal satisfies `string`.
  status satisfies string;

  // `assertType` requires exact equality, so `"ready"` and `string` differ.
  // @ts-expect-error ⛔ assertType error: Expected and actual types must be identical
  assertType<string, typeof status>();
  ```

- 420b03e: Added `Data`, `IsData`, `eqData`, `ObjectKind`, and `getObjectKind`

  `Data` is Evolu's recursive structured-cloneable data domain. It is
  intentionally limited to values supported by structured clone APIs such as
  worker `postMessage`: undefined, null, strings, numbers, bigints, booleans,
  Arrays, plain Objects, Sets, Maps, Dates, and Uint8Arrays. Cyclic and shared
  graphs are supported. Raw ArrayBuffers are excluded; represent bytes with a
  Uint8Array.

  The `Data` Type validates unknown values at runtime, while `IsData` checks
  declared TypeScript types, including ordinary interfaces without index
  signatures. `eqData` compares Data structurally with support for cycles,
  unordered Sets and Maps, Dates, and Uint8Arrays. The existing
  `eqJsonValue` and `eqJsonValueInput` helpers use the same comparison while
  retaining their narrower JSON-only types.

  `getObjectKind` exposes the shared representation classification used by Data
  validation and comparison. Plain Objects use a realm-neutral structural
  heuristic: a `null` prototype or an immediate root prototype with own
  `hasOwnProperty` and `isPrototypeOf` properties is accepted. A custom root
  prototype with the same shape can therefore be classified as plain. This
  heuristic assumes trusted JavaScript and is not a security boundary.

  ```ts
  import {
    Data,
    assertTrue,
    eqData,
    getObjectKind,
    type IsData,
  } from "@evolu/common";

  interface User {
    readonly name: string;
    readonly roles: ReadonlySet<string>;
  }

  const userIsData: IsData<User> = true;
  assertTrue(userIsData);

  const value = { name: "Ada", roles: new Set(["admin"]) };
  const result = Data.fromUnknown(value);

  assertTrue(result.ok);
  assertTrue(getObjectKind(value) === "Object");
  assertTrue(eqData(result.value, { name: "Ada", roles: new Set(["admin"]) }));
  ```

### Patch Changes

- 420b03e: Removed `SetUnexpectedPrototypeError` from Set validation

  The `set` Type no longer reports a prototype-specific error.
  `SetUnexpectedPrototypeError` was removed, and `SetError` now contains only
  `SetNotSetError` and `SetItemsError`.

  Evolu does not support subclassing native JavaScript objects. Code must pass
  ordinary Sets and must not depend on how a Set subclass is classified.

- 420b03e: Tightened plain-object prototype detection

  Plain-object APIs now use a realm-neutral structural heuristic. They accept a
  `null` prototype or an immediate root prototype with own `hasOwnProperty` and
  `isPrototypeOf` properties. This recognizes ordinary Objects from another
  JavaScript realm without relying on prototype identity.

  A custom root prototype with the same shape can therefore be classified as
  plain. The heuristic assumes trusted JavaScript and is not a prototype
  authentication or security boundary. Other custom prototypes and class
  instances are rejected; replace them with plain Objects and materialize required
  inherited values as own properties.

- 076dc42: Made `eqStrict` a reflexive SameValue comparison

  `eqStrict` now uses `Object.is`, matching Node.js `assert.strictEqual`. It
  considers `NaN` equal to itself and distinguishes `0` from `-0`.

  `eqArrayStrict` inherits the same semantics for its elements.

## 8.5.0

### Minor Changes

- 7037216: Added fixed-length mutable Array construction

  Use `createMutableArray` to preallocate an Array when its final length is known
  and fill it with indexed writes.

  ```ts
  import { createMutableArray } from "@evolu/common";

  const values = createMutableArray<number>(3);

  for (let index = 0; index < values.length; index++) {
    values[index] = index * 10;
  }

  expect(values).toEqual([0, 10, 20]);
  ```

### Patch Changes

- d52ccce: Enabled Unicode-aware regular expressions

  Built-in regular-expression Types now use Unicode code-point semantics and
  include `u` in validation error flags.

## 8.4.0

### Minor Changes

- b973c4e: Added nullish assertion helpers

  Use `assertNotNull` to narrow away `null` while preserving `undefined`, and use
  `assertNotUndefined` to narrow away `undefined` while preserving `null`.

  ```ts
  import { assertNotNull, assertNotUndefined } from "@evolu/common";

  const possiblyNull = undefined as string | null | undefined;
  assertNotNull(possiblyNull);
  expectTypeOf(possiblyNull).toEqualTypeOf<string | undefined>();

  const possiblyUndefined = null as string | null | undefined;
  assertNotUndefined(possiblyUndefined);
  expectTypeOf(possiblyUndefined).toEqualTypeOf<string | null>();
  ```

### Patch Changes

- b973c4e: Restored explicit null values in mutations

  `insert`, `update`, and `upsert` now store explicit `null` values in nullable columns, including columns in local-only tables.

## 8.3.3

### Patch Changes

- 3829805: Updated the random dependency to 5.5.1

  Seeded random generators, including `testCreateRandom`, `testCreateRandomLib`,
  `testCreateDeps`, and `testCreateId`, now produce a different deterministic
  sequence. Update snapshots and fixtures that assert their exact output.

## 8.3.2

### Patch Changes

- 25901b6: Fixed React Native bundling of the predefined Object Type

  React Native apps using Metro no longer fail during module initialization when importing Evolu Type utilities.

## 8.3.1

### Patch Changes

- 726e982: Improved Type documentation

  Expanded the Type overview with tested examples for branded constraints,
  structured errors, localized messages, and typed boundaries. Clarified runtime
  assertions, trust assumptions, and conversion terminology.

## 8.3.0

### Minor Changes

- f850ff8: Added localized Type error formatter modules

  Added formatter modules for Arabic, Bengali, Catalan, Chinese, Croatian, Czech,
  Danish, Dutch, Filipino, Finnish, French, German, Greek, Hebrew, Hindi,
  Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Malayalam, Marathi,
  Norwegian Bokmål, Persian, Polish, Portuguese, Punjabi, Romanian, Slovak,
  Slovenian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian,
  Urdu, and Vietnamese. Import each module from `@evolu/common/intl` and provide
  its formatters to `localizeTypes`.

  Completed Czech formatters for Set and the remaining built-in Types that own
  validation errors, including EvoluType, Base64Url, Name, Mnemonic, Id, TableId,
  Int64String, and DateIsoFromDate.

### Patch Changes

- 34fa9df: Improved API documentation

  Expanded the Result, Task, Type, and Owner documentation with module
  introductions, semantic API groups, and tested examples. Improved the platform
  `createRun` documentation for Web and React Native.

## 8.2.0

### Minor Changes

- 1487a7a: Added canonical decimal string Types

  `DecimalString` preserves exact signed base-10 decimal values as canonical
  strings. Canonical means that every value has one accepted spelling: leading
  zeroes, trailing fractional zeroes, `-0`, plus signs, and exponent notation are
  rejected. Sign-refinement factories and their predefined Types model positive,
  non-negative, negative, and non-positive decimal strings without converting them
  to JavaScript numbers.

  TypeScript template literal types can describe a fixed number of digit
  positions, but not arbitrarily long integer and fractional parts. `DecimalString`
  therefore uses a Brand so its TypeScript type accepts only values validated by
  the Type.

  ```ts
  import {
    DecimalString,
    NonNegativeDecimalString,
    PositiveDecimalString,
  } from "@evolu/common";

  expectOk(DecimalString.fromUnknown("-10.5"), "-10.5");
  expectOk(NonNegativeDecimalString.fromUnknown("0"), "0");
  expectOk(PositiveDecimalString.fromUnknown("10.5"), "10.5");

  expectErr(DecimalString.fromUnknown("10.50"), {
    type: "DecimalString",
    value: "10.50",
  });
  expectErr(NonNegativeDecimalString.fromUnknown("-10.5"), {
    type: "NonNegativeDecimalString",
    value: "-10.5",
  });
  expectErr(PositiveDecimalString.fromUnknown("0"), {
    type: "PositiveDecimalString",
    value: "0",
  });
  ```

- 1487a7a: Added `templateLiteral` and `templateLiteralParser`

  `templateLiteral` composes fixed strings and string-encoded Types into a
  canonical string Type. Its Output remains a string, so it is suitable for
  validation without decoding the individual parts.

  ```ts
  import { templateLiteral, union } from "@evolu/common";

  const Language = union("en", "cs");
  const Region = union("US", "CZ");
  const Locale = templateLiteral(Language, "-", Region);
  type Locale = typeof Locale.Output;

  const locale: Locale = "cs-CZ";
  // @ts-expect-error Locale excludes the unsupported "fr" language.
  const invalidLocale: Locale = "fr-CZ";

  expectTypeOf<Locale>().toEqualTypeOf<"en-US" | "en-CZ" | "cs-US" | "cs-CZ">();
  expect(locale).toBe("cs-CZ");
  expectOk(Locale.fromUnknown("cs-CZ"), "cs-CZ");
  expect(Locale.is("fr-CZ")).toBe(false);
  ```

  `Digit`, the bounded digit ranges, duration literals, and `PercentageLiteral`
  now use runtime Types while remaining usable as TypeScript types.

  ```ts
  import {
    Digit1To23,
    DurationLiteral,
    PercentageLiteral,
  } from "@evolu/common";

  const digit: Digit1To23 = "23";
  const duration: DurationLiteral = "1.5s";
  const percentage: PercentageLiteral = "12.5%";

  // @ts-expect-error Digit1To23 excludes "24".
  const invalidDigit: Digit1To23 = "24";
  // @ts-expect-error DurationLiteral requires the canonical "500ms" instead of "0.5s".
  const invalidDuration: DurationLiteral = "0.5s";
  // @ts-expect-error PercentageLiteral excludes percentages above 100%.
  const invalidPercentage: PercentageLiteral = "100.1%";

  expect(Digit1To23.is("23")).toBe(true);
  expect(Digit1To23.is("24")).toBe(false);
  expect(DurationLiteral.is("1.5s")).toBe(true);
  expect(DurationLiteral.is("0.5s")).toBe(false);
  expect(PercentageLiteral.is("12.5%")).toBe(true);
  expect(PercentageLiteral.is("100.1%")).toBe(false);
  ```

  `templateLiteralParser` accepts the same template parts as `templateLiteral`:
  fixed string literals and Types canonically encoded as strings. Instead of
  keeping Output as a string, fixed literals define the framing and Output is a
  readonly Tuple of the decoded Type parts. `to` encodes that Tuple back into the
  canonical string represented by the parent Type.

  When every capture uses identity encoding, the parent Output is the exact
  TypeScript template literal type. A transforming capture makes it nominal;
  create such strings with `to` or validate them with the parent Type.

  Deterministic framing is a core correctness guarantee. It preserves
  reversibility and keeps capture boundaries unambiguous. Different capture Tuples
  must never encode to the same string. The parser provides predictable parsing
  without pathological backtracking and decodes each capture once, so adversarial
  input cannot trigger exponential parser work.

  Fixed-width captures may be adjacent, but only one variable-width capture is
  allowed. A delimiter alone is not enough because it can also occur inside a
  capture.

  ### Parse and create structured strings

  ```ts
  import { templateLiteralParser, union } from "@evolu/common";

  const Language = union("en", "cs");
  const Region = union("US", "CZ");

  // Define a Type for "en-US" | "en-CZ" | "cs-US" | "cs-CZ".
  const SupportedLocale = templateLiteralParser(Language, "-", Region);

  // Output is the decoded language and region.
  type SupportedLocale = typeof SupportedLocale.Output;
  expectTypeOf<SupportedLocale>().toEqualTypeOf<
    readonly ["en" | "cs", "US" | "CZ"]
  >();

  // The parent Output is the canonical locale string.
  type SupportedLocaleLiteral = typeof SupportedLocale.parent.Output;
  expectTypeOf<SupportedLocaleLiteral>().toEqualTypeOf<
    "en-US" | "en-CZ" | "cs-US" | "cs-CZ"
  >();

  // Parse an unknown string into structured data.
  const result = SupportedLocale.fromUnknown("cs-CZ");
  assert(result.ok);
  const locale = result.value;
  expectTypeOf(locale).toEqualTypeOf<SupportedLocale>();
  expect(locale).toEqual(["cs", "CZ"]);
  expectErr(SupportedLocale.fromUnknown("cs/CZ"), {
    type: "TemplateLiteral",
    value: "cs/CZ",
  });

  // Encode structured data into its canonical string.
  const localeLiteral = SupportedLocale.to(locale);
  expectTypeOf(localeLiteral).toEqualTypeOf<SupportedLocaleLiteral>();
  expect(localeLiteral).toBe("cs-CZ");

  // Validate a string configuration value.
  const configValue: unknown = "cs-CZ";
  assert(SupportedLocale.parent.is(configValue));
  expectTypeOf(configValue).toEqualTypeOf<SupportedLocaleLiteral>();
  expect(SupportedLocale.parent.is("fr-CZ")).toBe(false);
  ```

  `SupportedLocale` is structured data for application code.
  `SupportedLocaleLiteral` is its canonical representation for configuration and
  other APIs that require a string, such as URL parameters, environment variables,
  and storage keys.

  ### Use branded string captures

  Branded captures model strings that TypeScript template literal types cannot
  express exactly, such as arbitrary-length canonical decimals:

  ```ts
  import {
    NonNegativeDecimalString,
    templateLiteralParser,
  } from "@evolu/common";

  const DecimalText = templateLiteralParser(
    "decimal:",
    NonNegativeDecimalString,
  );

  // DecimalText.to requires a validated NonNegativeDecimalString.
  const zero = NonNegativeDecimalString.orThrow("0");

  expectOk(DecimalText.fromUnknown("decimal:0"), [zero]);
  expect(DecimalText.to([zero])).toBe("decimal:0");
  ```

  ### Decode captures into non-string data

  Capture Types can use transformations to decode substrings into non-string data:

  ```ts
  import { Int64FromInt64String, templateLiteralParser } from "@evolu/common";

  const ItemId = templateLiteralParser("item-", Int64FromInt64String);
  type ItemId = typeof ItemId.Output;
  type ItemIdLiteral = typeof ItemId.parent.Output;

  // Decode the string into structured data.
  const result = ItemId.fromUnknown("item-42");
  assert(result.ok);
  const itemId = result.value;
  expectTypeOf(itemId).toEqualTypeOf<ItemId>();
  expect(itemId).toEqual([42n]);

  // Encode the structured data into its canonical string.
  const itemIdLiteral = ItemId.to(itemId);
  expectTypeOf(itemIdLiteral).toEqualTypeOf<ItemIdLiteral>();
  expect(itemIdLiteral).toBe("item-42");

  // TypeScript cannot prove from the literal alone that "42" is a valid Int64 encoding.
  // @ts-expect-error Validate it with ItemId.parent or create it with ItemId.to.
  const invalidItemIdLiteral: ItemIdLiteral = "item-42";
  ```

  ### Use deterministic framing

  Fixed-width captures can be adjacent:

  ```ts
  import { templateLiteralParser, union } from "@evolu/common";

  const Digit = union("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
  const TwoDigits = templateLiteralParser(Digit, Digit);
  type TwoDigits = typeof TwoDigits.Output;
  type TwoDigitsLiteral = typeof TwoDigits.parent.Output;

  const twoDigits: TwoDigits = ["4", "2"];
  const twoDigitsLiteral: TwoDigitsLiteral = "42";
  // @ts-expect-error TwoDigitsLiteral requires exactly two digits.
  const threeDigitsLiteral: TwoDigitsLiteral = "123";

  expectOk(TwoDigits.from.parent(twoDigitsLiteral), twoDigits);
  expect(TwoDigits.to(twoDigits)).toBe(twoDigitsLiteral);
  ```

  TypeScript rejects multiple variable-width captures because their encoded
  boundaries would be ambiguous:

  ```ts
  import { String, templateLiteralParser } from "@evolu/common";

  // @ts-expect-error At most one Type capture can have a variable-width string representation.
  templateLiteralParser(String, ":", String);
  ```

## 8.1.0

### Minor Changes

- d01ac49: Added `PositiveFiniteNumber`

  `PositiveFiniteNumber` validates finite numbers greater than zero and remains
  compatible with APIs requiring a `NonNegativeFiniteNumber`.

  ```ts
  import { NonNegativeFiniteNumber, PositiveFiniteNumber } from "@evolu/common";

  const value = PositiveFiniteNumber.orThrow(0.1);

  expectTypeOf(value).toMatchTypeOf<NonNegativeFiniteNumber>();
  expectOk(PositiveFiniteNumber.fromUnknown(1), 1);
  expectErr(PositiveFiniteNumber.fromUnknown(0), {
    type: "Positive",
    value: 0,
  });
  expectErr(PositiveFiniteNumber.fromUnknown(Infinity), {
    type: "Finite",
    value: Infinity,
  });
  ```

### Patch Changes

- d01ac49: Clarified exact decimal constraints

  `multipleOf` accepts canonical positive decimal string literals such as
  `"0.1"`. This keeps declarative divisors exact instead of converting them to
  IEEE-754 numbers. Invalid or dynamic divisors are rejected by TypeScript, so
  Type construction no longer performs redundant runtime divisor validation.

  Clarified that `PositiveDecimalString` preserves exact decimal values as
  canonical strings and does not implicitly provide decimal arithmetic.

  ```ts
  import {
    FiniteNumber,
    multipleOf,
    PositiveDecimalString,
    type Brand,
  } from "@evolu/common";

  const Tenths = multipleOf("0.1")(FiniteNumber);
  type Tenths = typeof Tenths.Output;

  expectTypeOf<Tenths>().toEqualTypeOf<FiniteNumber & Brand<"MultipleOf0.1">>();

  expectOk(Tenths.fromUnknown(0.3), 0.3);
  expectErr(Tenths.fromUnknown(0.31), {
    type: "MultipleOf0.1",
    value: 0.31,
    divisor: "0.1",
  });

  expectOk(PositiveDecimalString.fromUnknown("10.01"), "10.01");

  const invalidDeclarations = () => {
    // @ts-expect-error Divisors are exact decimal string literals.
    multipleOf(0.1);

    // @ts-expect-error Trailing fractional zeroes are not canonical.
    multipleOf("0.10");
  };

  expectTypeOf(invalidDeclarations).toBeFunction();
  ```

## 8.0.0

### Major Changes

- 98a4b6c: Refactored the Array module with breaking changes, better naming, and new helpers.

  ### Breaking Changes

  **Removed `isNonEmptyReadonlyArray`** — use `isNonEmptyArray` instead. The function now handles both mutable and readonly arrays via overloads:

  ```ts
  // Before
  if (isNonEmptyReadonlyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }

  // After — one function for both
  if (isNonEmptyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }
  ```

  **Removed mutable array helpers:**

  - `shiftArray`
  - `popArray`

  Use native `.shift()` and `.pop()` when mutation is necessary.

  ### New Constants
  - **`emptyArray`** — use as a default or initial value to avoid allocating new empty arrays

  ### New Types
  - Added **`AtLeastTwoReadonlyArray`** for readonly arrays with at least two elements

  ### Changed Functions
  - **`mapArray`, `flatMapArray`, `filterArray`, and `partitionArray`** — passed the source array as the callback's third argument; the native wrappers matched their native counterparts

  ### New Functions
  - **`arrayFrom`** — creates a readonly array from an iterable or by generating elements with a length and mapper
  - **`arrayFromAsync`** — creates a readonly array from an async iterable (or iterable of promises) and awaits all values
  - **`flatMapArray`** — maps each element to an array and flattens the result, preserving non-empty type when applicable
  - **`concatArrays`** — concatenates two arrays, returning non-empty when at least one input is non-empty
  - **`sortArray`** — returns a new sorted array (wraps `toSorted`), preserving non-empty type
  - **`reverseArray`** — returns a new reversed array (wraps `toReversed`), preserving non-empty type
  - **`spliceArray`** — returns a new array with elements removed/replaced (wraps `toSpliced`)
  - **`zipArray`** — combines multiple arrays into an array of tuples, preserving non-empty type

  ### Migration

  ```ts
  // isNonEmptyReadonlyArray → isNonEmptyArray
  -import { isNonEmptyReadonlyArray } from "@evolu/common";
  +import { isNonEmptyArray } from "@evolu/common";

  // Mutable array helpers were removed.
  -import { popArray, shiftArray } from "@evolu/common";
  +const first = items.shift();
  +const last = items.pop();
  ```

- c0250e9: Consolidated collection mapping into overloads of `allResult`, `all`, and
  `allSettled`. Removed `mapResult`, `map`, `mapSettled`, `InferMapOk`, and
  `InferMapSettled`. The `allResult` mapping overloads inferred unions of
  heterogeneous Result errors returned by the mapper. Task mapping overloads
  inferred intersections of heterogeneous Task dependencies returned by the
  mapper.

  Added an explicit `{ collect: false }` option to `allResult` and `all` for
  operations whose success values weren't needed. They stopped on the first
  error, returned `Result<void, E>` and `Task<void, E, D>` respectively, and did
  not allocate a collection for the success values. Generic Result iterables were
  consumed incrementally and stopped advancing on the first error.

  ```ts
  allResult(values, toResult);
  allResult(results, { collect: false });
  allResult(values, toResult, { collect: false });
  all(values, toTask);
  all(tasks, { collect: false });
  all(values, toTask, { collect: false });
  allSettled(values, toTask);
  ```

- 97f5314: Redesigned Console with structured logging and pluggable outputs

  **Breaking changes:**

  - Replaced `enabled` property with `ConsoleLevel` filtering (trace < debug < log < info < warn < error < silent)
  - Removed `enableLogging` config option - use `level` instead
  - Removed `createConsoleWithTime` - use `createConsoleFormatter` with `format` option
  - Removed `assert` method
  - Changed `TestConsole.getLogsSnapshot()` to `getEntriesSnapshot()` returning `ConsoleEntry` objects
  - Changed `TestConsole.clearLogs()` to `clearEntries()`

  **New features:**

  - Structured `ConsoleEntry` objects with method, path, and args
  - Pluggable `ConsoleOutput` interface for custom destinations (file, network, array)
  - `Console.child(name)` creates derived consoles with path prefixes
  - `children: ReadonlySet<Console>` tracks child consoles for batch operations
  - `name` property identifies consoles
  - `getLevel()`, `setLevel(level | null)`, `hasOwnLevel()` for runtime level control
  - `createConsoleFormatter` for timestamps (relative, absolute, iso) and path prefixes
  - `createNativeConsoleOutput` and `createConsoleArrayOutput` built-in outputs
  - Static level inheritance - children inherit parent's level at creation, then are independent
  - `createConsoleStoreOutput` — a `ConsoleOutput` that stores the latest entry in a `ReadonlyStore` for observing log entries (e.g., forwarding from workers to main thread)
  - `createMultiOutput` — fans out entries to multiple outputs (e.g., native console + store)
  - Simplified `testCreateConsole` to delegate to `createConsole` internally

- 5275b07: Replaced `evolu.createQuery` with standalone `createQueryBuilder` function

  Queries are now created using a standalone `createQueryBuilder` function instead of `evolu.createQuery` method. This enables query creation without an Evolu instance, improving code organization and enabling schema-first development.

  ```ts
  // Before
  const todosQuery = evolu.createQuery((db) =>
    db.selectFrom("todo").selectAll(),
  );

  // After
  const createQuery = createQueryBuilder(Schema);
  const todosQuery = createQuery((db) => db.selectFrom("todo").selectAll());
  ```

- cd6b74d: Removed the root `kysely` namespace export and exposed Evolu's SQLite JSON helpers as explicit named exports.

  Use `evoluJsonArrayFrom`, `evoluJsonObjectFrom`, `evoluJsonBuildObject`, `kyselySql`, and `KyselyNotNull` from `@evolu/common` instead of `kysely.jsonArrayFrom`, `kysely.jsonObjectFrom`, `kysely.jsonBuildObject`, `kysely.sql`, and `kysely.NotNull`.

  ```ts
  // Before
  import { kysely } from "@evolu/common";

  kysely.jsonArrayFrom(...)
  type Name = kysely.NotNull;

  // After
  import {
    evoluJsonArrayFrom,
    evoluJsonBuildObject,
    evoluJsonObjectFrom,
    kyselySql,
    type KyselyNotNull,
  } from "@evolu/common";

  evoluJsonArrayFrom(...)
  type Name = KyselyNotNull;
  ```

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 87780a3: Renamed `LazyValue<T>` to `Thunk<T>`, renamed the constant thunk helpers to `const*`, and added the `constant` factory
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 29d37c7: Renamed `createRecord` to `createMutableRecord` and `getProperty` to
  `getOwnProp`, added source-copying support to `createMutableRecord`, and froze
  `emptyRecord`.
- 3e3a93e: Replaced the legacy Evolu Type implementation with a lawful, composable codec
  system.

  ### Added

  #### CanonicalInput

  Added `CanonicalInput` alongside the existing `Input` and `Output`. Type now
  distinguishes its complete decoding boundary from the statically known subtype
  returned by complete encoding:

  ```text
  Input           ── partial decode ──▶ Output
  CanonicalInput  ◀─── total encode ─── Output

  CanonicalInput ⊆ Input
  ```

  `CanonicalInput` is the declared return type of `to`. It contains every encoded
  result and is itself contained by `Input`, but can be wider than the values
  actually emitted. `Output` describes the semantic value, which can use a
  different representation.

  For `FiniteNumber`, `Output` also describes the encoded result precisely. Its
  `Input` is correctly `number`, allowing decoding to reject `NaN` and
  infinities, while its `Output` and `CanonicalInput` are `FiniteNumber`. Encoding
  preserves that finite-number guarantee.

  For `Int64FromInt64String`, `Output` cannot describe the encoded result. Its
  `Input` is `string`, its `Output` is `Int64`, and its `CanonicalInput` is
  `Int64String`. Encoding an `Int64` produces the validated string representation,
  not an unrefined `string` or another `Int64`.

  Structural Type factories derive `CanonicalInput` recursively. When a refinement
  follows an arbitrary transformation, it conservatively retains the
  transformation's return type because TypeScript cannot determine which values
  the encoder returns for the narrowed `Output`.

  #### Transformations

  Added first-class `transform` Types and total `to` encoding. Transformations can
  change runtime representations in both directions while preserving precise
  Input, Output, CanonicalInput, validation errors, and composition. This supports
  lawful codecs such as `Int64FromInt64String` and `DateIsoFromDate` rather than
  limiting Types to validation-only refinements.

  #### JSON codecs

  Added the `json(Type, Name)` factory for creating a branded `Json` Type that
  stores another Type as JSON text. It statically requires the supplied Type's
  `CanonicalInput` to be JSON-compatible and returns total Type-to-Json and
  Json-to-Type conversions.

  ```ts
  // Age is built in; its definition is shown to make the constraint explicit.
  const Age = brand("Age", lessThan(200)(NonNegativeInt));

  const Person = object({
    name: String,
    age: Age,
  });
  type Person = typeof Person.Output;

  const [PersonJson, personToPersonJson, personJsonToPerson] = json(
    Person,
    "PersonJson",
  );
  type PersonJson = typeof PersonJson.Output;

  const person = Person.orThrow({ name: "Ada", age: 42 });
  const stored = personToPersonJson(person);

  expectTypeOf(stored).toEqualTypeOf<PersonJson>();
  expect(stored).toBe('{"name":"Ada","age":42}');

  const restored = personJsonToPerson(stored);

  expectTypeOf(restored).toEqualTypeOf<Person>();
  expect(restored).toEqual(person);
  ```

  The branded Type validates both the JSON text and the represented Type before
  accepting unknown storage values:

  ```ts
  expectOk(PersonJson.fromUnknown('{"name":"Ada","age":42}'), stored);

  const invalid = PersonJson.fromUnknown('{"name":"Ada","age":200}');

  assert(!invalid.ok);
  expect(PersonJson.formatError(invalid.error)).toBe(
    "The value 200 must be less than 200.",
  );
  ```

  The factory encodes through the supplied Type's canonical representation,
  rejects Types without a JSON-safe `CanonicalInput`, validates branded JSON
  against the represented Type, and parses text only once in the generated Type's
  specialized Json-parent operation.

  - Added Type-owned `formatError` and the `localizeTypes` derivation API. Every
    Type can format its structured errors directly, while `localizeTypes` creates
    fully typed localized Type collections.
  - Added typed `from` and `from.parent` entry points. Callers can begin at the
    most precise Type boundary they already satisfy, and the returned `Result`
    contains only errors introduced after that boundary. `fromUnknown` remains
    the complete validation boundary for genuinely unknown values.
  - Added `createType`, `lazy`, `discriminatedUnion`, and `objectTag` for custom
    validation, recursive Types, efficient discriminated routing, and object-tag
    domains.
  - Added predefined Types including `Never`, `Object`, `Symbol`, `UInt64`,
    `Age`, `PositiveDecimalString`, `DateIsoFromDate`,
    `Int64FromInt64String`, and `JsonValueFromJson`.
  - Added structured issue models for Arrays, Sets, Tuples, Objects, Records,
    Unions, discriminated Unions, transformations, and JSON values. Validation
    can stop at the first error or retain every reachable issue.

  ### Improved
  - Made `is` test exact Output membership. A transformed Type no longer reports
    that an encoded Input belongs to its semantic Output domain merely because it
    can be decoded.
  - Improved localization to follow composed error graphs without coupling
    validation logic to messages or bundling unused locales. Localized Types
    preserve their structured errors, recursive composition, and specialized
    public operations.
  - Improved `instanceOf` to require one concrete constructor and use intrinsic
    prototype-chain membership, accepting subclasses while ignoring custom
    `Symbol.hasInstance` implementations.
  - Kept `InferType` for declaring named Object and Typed Type Outputs as
    interfaces, preserving concise interface names in TypeScript tooltips and
    error messages.
  - Kept Standard Schema V1 interoperability and improved it to collect
    structural issues across nested values with exact property paths and the
    selected Type's localized messages. Standard Schema Input and Output
    inference now follows the Type's actual codec contract.
  - Made structural Types validate exact JavaScript representations. Arrays and
    Tuples require dense own data elements; Objects and Records require own,
    enumerable data properties; closed Objects reject excess properties; and
    accessors are rejected without being invoked.
  - Made structural validation realm-neutral where realm identity is not part of
    the semantic domain. Plain objects, Arrays, Sets, and supported built-ins from
    another realm are accepted when their representations are otherwise valid.
  - Made Type construction reject invalid declarations that TypeScript cannot
    express, including refinements that replace values, transformation callbacks
    returning the wrong representation, incompatible error names, and ambiguous
    child Types.
  - Made recursive validation and canonical JSON encoding stack-safe, including
    direct and mutually recursive `lazy` Types.

  ### Fixed
  - Fixed typed operations silently accepting structurally assignable values that
    violate runtime invariants. Such violations now throw `Expected <Type name>.`
    errors with the exact structured validation error preserved as `cause`.
  - Fixed Object and Record validation accepting inherited, hidden,
    accessor-backed, or unexpected properties and fixed Array, Set, and Tuple
    validation accepting invalid structural representations.
  - Fixed composed transformations losing output-side validation errors or using
    the wrong decoding and encoding boundary.
  - Fixed Union dispatch, error inference, literal shorthand, and composition
    with transformed and structural member Types.
  - Fixed localized Types losing specialized public operations, including the
    generated JSON Type's single-parse `from.parent` operation.

  ### Changed and removed
  - Renamed `ExtractType` to `ExtractTyped` to clarify that it selects a
    discriminated member from a `Typed` Output union rather than extracting the
    Output of an Evolu Type.
  - Replaced legacy `base` and `recursive` construction with `createType` and
    `lazy`.
  - Replaced the legacy global formatter registry and standalone formatter
    functions with Type-owned `formatError` and tree-shakeable localized Type
    collections.
  - Removed `CurrencyCode` because its validation modeled currency identifiers
    incorrectly.
  - Removed redundant predefined String Types such as `NonEmptyString`,
    `String100`, and `NonEmptyString100`. Applications can compose the exact
    String constraints their domain requires, while Evolu retains the recommended
    trimmed, non-empty defaults.

- 7fe328d: Changed `ok()` to return `Result<T, never>` and `err()` to return `Result<never, E>` for correct type inference.
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics

  - Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
  - Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
  - Removed `SqliteError` from SQLite driver/task APIs
  - Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
  - Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
  - Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
  - Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
  - Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
  - Updated Expo and op-sqlite drivers to match the new API
  - Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:

  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - Such failures now throw as Task defects, panic the owning Run tree, and are reported through its `ReportDefect` dependency.
  - Platform Run adapters provide native defect reporters, and applications can inject a custom reporter at the composition root.

  Boundary handling:

  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- 252ede2: Added Task and Resource APIs for structured asynchronous lifetimes.

  Task provides JavaScript-native structured concurrency. A Run starts Tasks, owns their child lifetimes, propagates abort, waits for cleanup, reports defects, provides dependencies, and exposes lifecycle state. Tasks return domain outcomes as Results, while Fibers provide Promise-compatible handles for running work.

  Task includes helpers for collection, racing, bounded concurrency, scheduling, retry, repetition, timeouts, callbacks, HTTP requests, abortability, daemons, resource bracketing, and concurrency primitives.

  Resource provides concurrency-safe ownership and reuse of Disposable and AsyncDisposable values. Shared resources are created lazily, retained through disposable leases, and disposed after their final lease is released. Resources can be indexed by logical keys, retained by claims, observed through snapshots, kept alive for configurable idle periods, and checked for leaked ownership in development.

- e96c8dd: Replaced inherited Task concurrency with collection options

  Removed `concurrently` and `Run.concurrency`. Added a `concurrency` option to `all`, `allSettled`, `any`, `firstN`, `firstNSettled`, and `each`. Each helper defaulted to running one Task at a time, while `race` continued to run every Task concurrently.

- d30b95a: Refactored Time module for type safety, consistency, and better abstractions.

  **Type safety:**

  - Changed `Time.now()` return type from `number` to `Millis`
  - Added `Millis` branded type with efficient 6-byte serialization (max value: year 10889)
  - Added `minMillis` and `maxMillis` constants
  - `now()` now throw on invalid values for consistent error handling

  **Timer abstraction:**

  - Added `Time.setTimeout` and `Time.clearTimeout` for platform-agnostic timers
  - Added `TimeoutId` opaque type for timeout handles
  - Added `TestTime` interface with `advance()` for controllable time in tests
  - Added `testCreateTime` with `startAt` and `autoIncrement: "microtask" | "sync"` options

  **Duration literals:**

  - Renamed `DurationString` to `DurationLiteral`
  - Each duration has exactly one canonical form (e.g., "1000ms" must be written as "1s")
  - Added decimal support: "1.5s" (1500ms), "1.5h" (90 minutes)
  - Added weeks ("1w" to "51w") and years ("1y" to "99y")
  - Removed combination syntax ("1h 30m") in favor of decimals ("1.5h")
  - Months not supported (variable length)

  **UI responsiveness constants:**

  - `ms60fps` (16ms frame budget at 60fps)
  - `ms120fps` (8ms frame budget at 120fps)
  - `msLongTask` (50ms long task threshold for use with `yieldNow`)

  **Formatting utilities:**

  - Added `formatMillisAsDuration(millis)` - formats as human-readable duration (`1.234s`, `1m30.000s`, `1h30m45.000s`)
  - Added `formatMillisAsClockTime(millis)` - formats as clock time (`HH:MM:SS.mmm`)
  - Added `/*#__PURE__*/` annotation to `Millis` for better tree-shaking

- b85837f: Improved wall-clock, performance, and monotonic time APIs.

  **Common:**

  - Replaced `Time.nowDateIso()` with the `Time.now("DateIso")` overload.
  - Added `Time.performance` with a high-resolution clock and time origin, plus branded `PerformanceTime`, `PerformanceTimeOrigin`, and `PerformanceDuration` values.
  - Added `performanceDurationBetween()` for measuring elapsed performance time.
  - Made timeout IDs instance-owned so clearing an ID with another `Time` instance throws.
  - Made native-range timeouts independent of wall-clock changes while retaining absolute-deadline handling for longer timeouts.
  - Extended `formatMillisAsDuration()` to format days, weeks, and years.

  **Node.js:**

  - Added `NodejsTime` and `createNodejsTime()` with `hrtime()` for monotonic nanosecond readings.
  - Added branded `HrTime` and `HrDuration` values with `hrDurationBetween()`.
  - Added `hrDurationToMillis()` and `millisToHrDuration()` conversions.

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**

  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**

  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 9ba5442: Renamed `TransferableError` to `UnknownError` to better reflect its purpose as a wrapper for unknown errors caught at runtime, not just errors that need to be transferred between contexts
- c24ec2f: **Breaking:** Standard Schema validation now returns JSON-serialized errors instead of formatted messages

  Users who need human-readable messages should deserialize the error and format it using appropriate `TypeErrorFormatter`s:

  ```ts
  const result = MyType["~standard"].validate(input);
  if (!result.ok) {
    for (const issue of result.issues) {
      const error = JSON.parse(issue.message);
      const message = formatTypeError(error);
      // use message...
    }
  }
  ```

  This gives consumers full control over error formatting while keeping the Standard Schema integration simple.

- 5c55b05: Changed the local database and ownership layout.

  Upgrading an existing Evolu 7 application to Evolu 8 is not yet supported.
  Applications containing Evolu 7 user data should remain on Evolu 7 until
  migration support is released. New Evolu 8 applications and applications
  already using Evolu 8 preview releases are unaffected.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:

  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

- 66cfc01: Renamed the exported `Mutable<T>` utility type to `Writable<T>`.

### Minor Changes

- 5a21b73: Added `disposable` and `isDisposable` for safe object disposal

  `disposable` adds synchronous or asynchronous disposal to an object and prevents its methods from being called after disposal. It can own an existing `DisposableStack` or `AsyncDisposableStack`, transferring the stack's resources to the returned object.

  `isDisposable` checks whether a value implements synchronous or asynchronous JavaScript disposal.

- 705c6af: Added the `IsUnion` TypeScript utility type.
- 555627d: Added `LeakDetector` for development-time leak detection

  `LeakDetector` uses `FinalizationRegistry` to report handles that are garbage-collected without explicit cleanup, including the stack where each handle was tracked. It is a no-op in production and in runtimes without `FinalizationRegistry`.

  Evolu developers do not need to use `LeakDetector` directly. The upcoming Evolu Task and Resource APIs enable it by default in development mode.

- 86726aa: Added `RefCountedRelation` for bidirectional retain counts

  `createRefCountedRelation` tracks a retain count for each pair while indexing canonical values in both directions. It supports custom lookup functions, reports pair transitions through `increment` and `decrement`, and returns snapshots that remain stable while the relation is mutated.

- 6fc3bba: Added `todo` function, a development placeholder that always throws

  Use to sketch function bodies before implementing them. TypeScript infers the return type from context, so surrounding code still type-checks. Use an explicit generic when there is no return type annotation.

  ```ts
  // Type inferred from return type annotation
  const fetchUser = (id: UserId): Result<User, FetchError> => todo();

  expectTypeOf(fetchUser).returns.toEqualTypeOf<Result<User, FetchError>>();

  // Explicit generic when no return type
  const getConfig = () => todo<Config>();

  expectTypeOf(getConfig).returns.toEqualTypeOf<Config>();
  ```

- 2f39c8e: Added utilities for awaitable values, numeric ranges, and type intersections

  `Awaitable<T>` represents a value that can be returned synchronously or as a `PromiseLike`, while `isPromiseLike` narrows an awaitable value for code that handles the synchronous path without an unnecessary await.

  `Digit`, `Digit1To9`, `Digit1To6`, `Digit1To23`, `Digit1To51`, `Digit1To59`, and `Digit1To99` provide bounded numeric string types for validating values such as days, hours, weeks, minutes, seconds, and years.

  `UnionToIntersection<U>` converts a union to an intersection. `ParameterIntersection<T>` infers the intersection of parameter types from a union of unary functions without allowing an `unknown` parameter to erase the concrete parameter types.

  `KeysOfUnion<T>` returns every property key present in any member of a union.

  `ValueWithLength` was added for values with a readonly numeric `length`.

  `CompileTimeError<Context, Message>` was added for consistent, readable compiler-facing error messages, and Schema validation errors were updated to use it.

- ce83b24: Added assertion utilities for Evolu Types and non-nullable values

  `assertType` validates a value against an Evolu Type and narrows it to the inferred TypeScript type. It uses the Type name for the error message and preserves the Type validation error as the cause.

  `assertNonNullable` verifies that a value is neither `null` nor `undefined` and narrows it to `NonNullable<T>` for invariants that TypeScript cannot prove statically.

  ```ts
  const length = buffer.getLength();
  assertType(NonNegativeInt, length);
  ```

- 408307b: Added `escapeRegExp` for escaping strings used in regular expressions and
  improved `safelyStringifyUnknownValue` for formatting unknown diagnostic
  values.
- 1a04b81: Added tree-shakeable Czech Evolu Type error formatters under `@evolu/common/intl`.
- a883a8c: Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

  Added WebSocket test helpers for native client setup and raw upgrade requests.

  Made relay storage count duplicate timestamped messages only once when computing owner usage.

  Renamed the Node.js `startRelay` API to `createRelay` and made it return a Resource-producing Task whose disposal owns the relay lifecycle.

  Replaced the Node.js `createRun` and `ShutdownDep` APIs with `runMain`, which owns the root Run, handles termination signals, disposes returned resources, reports defects, and supports service and command exit behavior.

- 5f9602c: Improved `trySync` and `tryAsync` exception handling

  `trySync` and `tryAsync` now return the original thrown or rejected value as `Err` when no error mapper is provided. Error mappers can throw when a failure must be escalated instead of represented as a `Result`.

  `tryAsync` now accepts synchronous and asynchronous return values while preserving its asynchronous boundary.

- 0af46e1: Added Map and WeakMap upsert helpers and binary-type improvements to `@evolu/common`.

  - Added `LookupMap.getOrInsert` and `LookupMap.getOrInsertComputed` for lookup-key-aware insert-or-read operations that preserve the first logical key representative.
  - Added the `ArrayBuffer` base `Type` and formatter support.
  - Installed `Map` and `WeakMap` collection upsert polyfills in `installPolyfills()` for runtimes that do not provide them yet.
  - Normalized `WebSocket.send` binary payload handling so `Uint8Array` views backed by `ArrayBuffer` stay zero-copy while `SharedArrayBuffer`-backed views are cloned into a sendable `Uint8Array`.

- f0bbebb: Added `createObjectURL` helper for safe, disposable `URL.createObjectURL` usage using JS Resource management so the URL is disposed automatically when the scope ends.

  Example:

  ```ts
  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((data) => {
      using objectUrl = createObjectURL(
        new Blob([data], { type: "application/x-sqlite3" }),
      );

      const link = document.createElement("a");
      link.href = objectUrl.url;
      link.download = `${evolu.name}.sqlite3`;
      link.click();
    });
  };
  ```

- 332dfca: Added pull-based protocol types for modeling three-outcome operations

  New types and utilities for iterators and streams where completion is a normal outcome, not an error:

  - `Done<D>` - Signal type for normal completion with optional summary value
  - `done(value)` - Factory function to create Done instances
  - `NextResult<A, E, D>` - Result that can complete with value, error, or done
  - `nextResult(ok, err, done)` - Factory for creating NextResult Type instances
  - `UnknownNextResult` - Type instance for runtime `.is()` checks
  - `InferDone<R>` - Extracts the done value type from a NextResult
  - `NextTask<T, E, D>` - Task that can complete with value, error, or done
  - `InferTaskDone<T>` - Extracts the done value type from a NextTask

  The naming follows the existing pattern: `Result` → `NextResult`, `Task` → `NextTask`.

- 3247415: Added readable percentage inputs to the Number module.

  `Percentage` follows the same pattern as `Duration`: APIs accept a readable,
  compile-time-validated literal for values written in code, or a validated
  numeric value for computed and dynamic inputs.

  ```ts
  // Readable static values.
  jitter("25%")(schedule);
  spaced("30s");

  // Validated computed values.
  jitter(Ratio.orThrow(computedRatio))(schedule);
  spaced(Millis.orThrow(computedMillis));
  ```

  This keeps call sites self-explanatory (`"25%"` instead of the ambiguous `0.25`)
  without sacrificing numeric precision or runtime validation.

  - `PercentageLiteral` represents canonical values from `"0%"` to `"100%"` with up to one decimal place.
  - `Percentage` accepts either a `PercentageLiteral` or a validated `Ratio`.
  - `percentageToRatio` converts either representation to a numeric `Ratio`.

- 7da2364: Added Option module for distinguishing absence from nullable values.

  Use Option when the value itself can be `null` or `undefined`. For APIs where `null` means "not found", just use `T | null` directly.

  **Types:**

  - `Option<T>` — `Some<T> | None`
  - `Some<T>` — present value
  - `None` — absent value
  - `InferOption<O>` — extracts value type from Option or Some

  **Functions:**

  - `some(value)` — creates a Some
  - `none` — shared None instance
  - `isSome(option)` — type guard for Some
  - `isNone(option)` — type guard for None
  - `fromNullable(value)` — converts nullable to Option

- 6f1d6ea: Added `RandomNumber` branded type for type-safe random values

  - `RandomNumber` — branded `number` type for values in [0, 1) range
  - `Random.next()` now returns `RandomNumber` instead of `number`
  - Prevents accidentally passing arbitrary numbers where random values are expected

- 5f97e83: Added Result composition helpers for arrays and structs.

  - **`flatMapResult`** — composes a successful Result with another Result-returning operation
  - **`allResult`** — extracts all values from an array/struct of Results, returning the first error if any fails
  - **`mapResult`** — maps items to Results and extracts all values, returning the first error if any fails
  - **`anyResult`** — returns the first successful Result, or the last error if all fail

  ```ts
  // Extract values from array of Results
  const results = [ok(1), ok(2), ok(3)];
  const all = allResult(results); // ok([1, 2, 3])

  // Map items to Results
  const users = mapResult(userIds, fetchUser);
  // Result<ReadonlyArray<User>, FetchError>

  // First success wins
  const result = anyResult([err("a"), ok(42), err("b")]); // ok(42)

  // Struct support
  const struct = allResult({ a: ok(1), b: ok("two") });
  // ok({ a: 1, b: "two" })
  ```

- 78a1a64: Added runtime identity for interfaces.

  `Instance`, `instance`, and `isInstance` provide a realm-neutral alternative to
  `instanceof` for trusted objects defined by interfaces. `EvoluType` uses the
  same identity to validate Evolu Types.

  ```ts
  interface Foo extends Instance<"Foo"> {
    readonly value: string;
  }

  const foo: Foo = { ...instance("Foo"), value: "value" };
  const isFoo = isInstance<Foo>("Foo");

  expect(isFoo(foo)).toBe(true);
  ```

- 2c8576e: Added SameValueZero equality and used it for number equality and Store change detection.
- 3ba2a92: Added Schedule module for composable scheduling strategies.

  **Schedule** is a composable abstraction for retry, repeat, and rate limiting. Each schedule is a state machine: calling `schedule(deps)` creates a step function, and each `step(input)` returns `Ok([Output, Millis])` or `Err(Done<void>)` to stop.

  **Constructors:**

  - `forever` — never stops, no delay (base for composition)
  - `once` — runs exactly once
  - `recurs(n)` — runs n times
  - `spaced(duration)` — constant delay
  - `exponential(base, factor?)` — exponential backoff
  - `linear(base)` — linear backoff
  - `fibonacci(initial)` — Fibonacci backoff
  - `fixed(interval)` — window-aligned intervals
  - `windowed(interval)` — sleeps until next window boundary
  - `fromDelay(duration)` — single delay
  - `fromDelays(...durations)` — sequence of delays
  - `elapsed` — outputs elapsed time
  - `during(duration)` — runs for specified duration
  - `always(value)` — constant output
  - `unfoldSchedule(initial, next)` — state machine

  **Combinators:**

  - Limiting: `take`, `maxElapsed`, `maxDelay`
  - Delay: `jitter` (downward or mean-preserving around jitter), `delayed`, `addDelay`, `modifyDelay`, `compensate`
  - Filtering: `whileScheduleInput`, `untilScheduleInput`, `whileScheduleOutput`, `untilScheduleOutput`, `resetScheduleAfter`
  - Transform: `mapSchedule`, `passthrough`, `foldSchedule`, `repetitions`, `delays`
  - Collection: `collectAllScheduleOutputs`, `collectScheduleInputs`, `collectWhileScheduleOutput`, `collectUntilScheduleOutput`
  - Composition: `sequenceSchedules`, `intersectSchedules`, `unionSchedules`, `whenInput`
  - Side effects: `tapScheduleOutput`, `tapScheduleInput`

  **Presets:**

  - `retryStrategyAws` — AWS SDK for Java 2.1 ordinary-failure timing with exponential backoff (50ms base), max 2 retries, 20s cap, and full jitter

- 5720b0b: Added Set module with type-safe helpers for immutable set operations.

  **Types:**

  - `NonEmptyReadonlySet<T>` — branded type for sets with at least one element (no mutable variant because `clear()`/`delete()` would break the guarantee)

  **Constants:**

  - `emptySet` — singleton empty set to avoid allocations

  **Type guards:**

  - `isNonEmptySet` — narrows to branded `NonEmptyReadonlySet`

  **Transformations:**

  - `addToSet` — returns branded non-empty set with item added
  - `deleteFromSet` — returns new set with item removed
  - `mapSet` — maps over set, preserves non-empty type
  - `filterSet` — filters set with predicate or refinement

  **Accessors:**

  - `firstInSet` — returns first element by insertion order (requires branded type)

- ef7f242: Added Web Locks helpers in `@evolu/common`: `LockManagerDep`,
  `testCreateLockManager`, and `acquireLeaderLock`.

  `testCreateLockManager` is a native-backed test helper because native `LockManager` cannot be instantiated per test. It isolates lock usage per instance with internal namespacing while preserving visible lock names and native Web Locks behavior in tests.

  `acquireLeaderLock` acquires an exclusive leader-election lease for a name and returns an async-disposable handle that holds leadership until disposed.

  Added a React Native `lockManager` ponyfill in `@evolu/react-native` because React Native does not support [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) yet.

- e948269: Added optional equality function to `Ref` and `ReadonlyStore` interface. `Ref.set` and `Ref.modify` now return `boolean` indicating whether state was updated. `Store` now uses `Ref` internally for state management.
- d1f817f: Added Resource management polyfills

  Provides `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`, and `AsyncDisposableStack` for environments without native support (e.g., Safari). This enables the `using` and `await using` declarations for automatic resource cleanup.

  Polyfills are installed automatically when importing `@evolu/common`.

  See `Result.test.ts` for usage patterns combining `Result` with `using`, `DisposableStack`, and `AsyncDisposableStack`.

- 252ede2: Added Task-aware HTTP helpers.

  `fetch` consumes the native `Response` within the Task lifetime and supports text, JSON, bytes, headers-only, and custom response consumers. It distinguishes transport, HTTP status, and response body errors while preserving Task abort semantics.

  `NativeFetchDep` makes the underlying fetch implementation replaceable at the composition root. Added deterministic native fetch test helpers for recording requests, queueing responses, and testing response body failures.

- 2516e46: Added `Ratio` to the Type module for validated finite numbers from 0 to 1, inclusive.

  A ratio is the numeric representation of a percentage: `0.25` represents `25%`.

- 3b74e48: Added `result` Type factory and `typed` overload for props-less discriminants

  **Result Type factory:**

  - `result(okType, errType)` — creates a Type for validating serialized Results from storage, APIs, or message passing
  - `UnknownResult` — validates `Result<unknown, unknown>` for runtime `.is()` checks

  **typed overload:**

  - `typed(tag)` now accepts just a tag without props for simple discriminants like `typed("Pending")`
  - Added `TypedType<Tag, Props?>` helper type for the return type of `typed`

- 9373afa: Added `Typed` interface and `typed` factory for discriminated unions

  Discriminated unions model mutually exclusive states where each variant is a distinct type. This makes illegal states unrepresentable — invalid combinations cannot exist.

  ```ts
  // Type-only usage for static discrimination
  interface Pending extends Typed<"Pending"> {
    readonly createdAt: DateIso;
  }
  interface Shipped extends Typed<"Shipped"> {
    readonly trackingNumber: TrackingNumber;
  }
  type OrderState = Pending | Shipped;

  // Runtime validation with typed() factory
  const Pending = typed("Pending", { createdAt: DateIso });
  const Shipped = typed("Shipped", { trackingNumber: TrackingNumber });
  ```

- 65a86e2: Added `webSocketReconnectSchedule` as the default WebSocket reconnect policy.

  The schedule retries indefinitely with exponential backoff, a 100ms base, a
  30s cap, and full jitter.

### Patch Changes

- b096543: Added test coverage proving that `createSlip21` normalizes numeric path elements to strings.
- e6b166a: Preserved the native console receiver when writing console output.
- f7d505a: Fixed in-memory transferred message port lifetime so transferred ports stayed usable while ownership moved between wrappers during disposal and re-creation.
- cebf659: Preserved specialized Type input operations during localization so generated JSON Types parse their Json parent only once.
- a70d933: Improved Schedule timing safety and validation.

  Schedule now:

  - Saturates computed delays to valid `Millis` values instead of throwing on overflow.
  - Handles backwards-clock elapsed deltas without producing invalid branded values.
  - Validates numeric Schedule options.

  Also added:

  - `saturateMillis` in the Time module for converting numbers to valid `Millis` values with overflow saturation.
  - `NonNegativeFiniteNumber` in the Type module for validating non-negative finite numbers.

- 0fbb5e7: Kept SharedWorker Evolu tenants alive briefly after the last instance was released so immediate dispose-and-recreate flows continue using the same local-first runtime.
- 151e73b: Updated Kysely to 0.29.4 and removed its unnecessary runtime import from TypeScript utilities.
- 39084b3: Updated Kysely to 0.29 and msgpackr to 2.

## 8.0.0-next.5

### Minor Changes

- 63dce92: Updated Task and Run dependency injection API.

  Removed `Run.addDeps` because every `Run` now owns its deps. The new API is more flexible and better matches sync Pure DI: deps are passed explicitly where a task is called, can replace existing deps when needed, and can be scoped to an owned disposable `Run` with `run.create(deps)`.
  - Renamed `RunDeps` to `RunDefaultDeps` to describe default Run dependencies more clearly.
  - Replaced `Run.addDeps` with explicit dependency passing via `run(task, deps)`, `run.orThrow(task, deps)`, and `run.create(deps)`.
  - Allowed explicit deps to override default `RunDefaultDeps` when needed.

### Patch Changes

- 0fbb5e7: Kept SharedWorker Evolu tenants alive briefly after the last instance was released so immediate dispose-and-recreate flows continue using the same local-first runtime.

## 8.0.0-next.4

### Minor Changes

- ef7f242: Added Web Locks helpers in `@evolu/common`: `LockManagerDep`,
  `testCreateLockManager`, and `acquireLeaderLock`.

  `testCreateLockManager` is a native-backed test helper because native `LockManager` cannot be instantiated per test. It isolates lock usage per instance with internal namespacing while preserving visible lock names and native Web Locks behavior in tests.

  `acquireLeaderLock` acquires an exclusive leader-election lease for a name and returns an async-disposable handle that holds leadership until disposed.

  Added a React Native `lockManager` ponyfill in `@evolu/react-native` because React Native does not support [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) yet.

### Patch Changes

- a70d933: Improved Schedule timing safety and validation.

  Schedule now:
  - Saturates computed delays to valid `Millis` values instead of throwing on overflow.
  - Handles backwards-clock elapsed deltas without producing invalid branded values.
  - Validates numeric Schedule options.

  Also added:
  - `saturateMillis` in the Time module for converting numbers to valid `Millis` values with overflow saturation.
  - `NonNegativeFiniteNumber` in the Type module for validating non-negative finite numbers.

## 8.0.0-next.3

### Patch Changes

- f7d505a: Fixed in-memory transferred message port lifetime so transferred ports stayed usable while ownership moved between wrappers during disposal and re-creation.

## 8.0.0-next.2

### Patch Changes

- b096543: Added test coverage proving that `createSlip21` normalizes numeric path elements to strings.

## 8.0.0-next.1

### Major Changes

- 45e62ac: Updated the time testing API and added deterministic test ids.

  **Breaking changes:**
  - Changed `testCreateTime({ autoIncrement })` to accept `"microtask" | "sync"` instead of `boolean`

  **Added:**
  - Added `testCreateId()` for deterministic branded and unbranded ids in tests

### Minor Changes

- a883a8c: Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

  Added WebSocket test helpers for native client setup and raw upgrade requests.

  Made relay storage count duplicate timestamped messages only once when computing owner usage.

- 0af46e1: Added Map and WeakMap upsert helpers and binary-type improvements to `@evolu/common`.
  - Added `LookupMap.getOrInsert` and `LookupMap.getOrInsertComputed` for lookup-key-aware insert-or-read operations that preserve the first logical key representative.
  - Added the `ArrayBuffer` base `Type` and formatter support.
  - Installed `Map` and `WeakMap` collection upsert polyfills in `installPolyfills()` for runtimes that do not provide them yet.
  - Normalized `WebSocket.send` binary payload handling so `Uint8Array` views backed by `ArrayBuffer` stay zero-copy while `SharedArrayBuffer`-backed views are cloned into a sendable `Uint8Array`.

## 8.0.0-next.0

### Major Changes

- 98a4b6c: Refactored the Array module with breaking changes, better naming, and new helpers.

  ### Breaking Changes

  **Removed `isNonEmptyReadonlyArray`** — use `isNonEmptyArray` instead. The function now handles both mutable and readonly arrays via overloads:

  ```ts
  // Before
  if (isNonEmptyReadonlyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }

  // After — one function for both
  if (isNonEmptyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }
  ```

  **Renamed mutation functions** for consistency with the `...Array` suffix pattern:
  - `shiftArray` → `shiftFromArray`
  - `popArray` → `popFromArray`

  ### New Constants
  - **`emptyArray`** — use as a default or initial value to avoid allocating new empty arrays

  ### New Functions
  - **`arrayFrom`** — creates a readonly array from an iterable or by generating elements with a length and mapper
  - **`arrayFromAsync`** — creates a readonly array from an async iterable (or iterable of promises) and awaits all values
  - **`flatMapArray`** — maps each element to an array and flattens the result, preserving non-empty type when applicable
  - **`concatArrays`** — concatenates two arrays, returning non-empty when at least one input is non-empty
  - **`sortArray`** — returns a new sorted array (wraps `toSorted`), preserving non-empty type
  - **`reverseArray`** — returns a new reversed array (wraps `toReversed`), preserving non-empty type
  - **`spliceArray`** — returns a new array with elements removed/replaced (wraps `toSpliced`)
  - **`zipArray`** — combines multiple arrays into an array of tuples, preserving non-empty type

  ### Migration

  ```ts
  // isNonEmptyReadonlyArray → isNonEmptyArray
  -import { isNonEmptyReadonlyArray } from "@evolu/common";
  +import { isNonEmptyArray } from "@evolu/common";

  // shiftArray → shiftFromArray
  -import { shiftArray } from "@evolu/common";
  +import { shiftFromArray } from "@evolu/common";

  // popArray → popFromArray
  -import { popArray } from "@evolu/common";
  +import { popFromArray } from "@evolu/common";
  ```

- 97f5314: Redesigned Console with structured logging and pluggable outputs

  **Breaking changes:**
  - Replaced `enabled` property with `ConsoleLevel` filtering (trace < debug < log < info < warn < error < silent)
  - Removed `enableLogging` config option - use `level` instead
  - Removed `createConsoleWithTime` - use `createConsoleFormatter` with `format` option
  - Removed `assert` method
  - Changed `TestConsole.getLogsSnapshot()` to `getEntriesSnapshot()` returning `ConsoleEntry` objects
  - Changed `TestConsole.clearLogs()` to `clearEntries()`

  **New features:**
  - Structured `ConsoleEntry` objects with method, path, and args
  - Pluggable `ConsoleOutput` interface for custom destinations (file, network, array)
  - `Console.child(name)` creates derived consoles with path prefixes
  - `children: ReadonlySet<Console>` tracks child consoles for batch operations
  - `name` property identifies consoles
  - `getLevel()`, `setLevel(level | null)`, `hasOwnLevel()` for runtime level control
  - `createConsoleFormatter` for timestamps (relative, absolute, iso) and path prefixes
  - `createNativeConsoleOutput` and `createConsoleArrayOutput` built-in outputs
  - Static level inheritance - children inherit parent's level at creation, then are independent
  - `createConsoleStoreOutput` — a `ConsoleOutput` that stores the latest entry in a `ReadonlyStore` for observing log entries (e.g., forwarding from workers to main thread)
  - `createMultiOutput` — fans out entries to multiple outputs (e.g., native console + store)
  - Simplified `testCreateConsole` to delegate to `createConsole` internally

- 5275b07: Replaced `evolu.createQuery` with standalone `createQueryBuilder` function

  Queries are now created using a standalone `createQueryBuilder` function instead of `evolu.createQuery` method. This enables query creation without an Evolu instance, improving code organization and enabling schema-first development.

  ```ts
  // Before
  const todosQuery = evolu.createQuery((db) =>
    db.selectFrom("todo").selectAll(),
  );

  // After
  const createQuery = createQueryBuilder(Schema);
  const todosQuery = createQuery((db) => db.selectFrom("todo").selectAll());
  ```

- cd6b74d: Removed the root `kysely` namespace export and exposed Evolu's SQLite JSON helpers as explicit named exports.

  Use `evoluJsonArrayFrom`, `evoluJsonObjectFrom`, `evoluJsonBuildObject`, `kyselySql`, and `KyselyNotNull` from `@evolu/common` instead of `kysely.jsonArrayFrom`, `kysely.jsonObjectFrom`, `kysely.jsonBuildObject`, `kysely.sql`, and `kysely.NotNull`.

  ```ts
  // Before
  import { kysely } from "@evolu/common";

  kysely.jsonArrayFrom(...)
  type Name = kysely.NotNull;

  // After
  import {
    evoluJsonArrayFrom,
    evoluJsonBuildObject,
    evoluJsonObjectFrom,
    kyselySql,
    type KyselyNotNull,
  } from "@evolu/common";

  evoluJsonArrayFrom(...)
  type Name = KyselyNotNull;
  ```

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 87780a3: Renamed `LazyValue<T>` to `Lazy<T>`, renamed `const*` lazy helpers to `lazy*`, and added the `lazy` factory
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 7fe328d: Changed `ok()` to return `Result<T, never>` and `err()` to return `Result<never, E>` for correct type inference.
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics
  - Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
  - Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
  - Removed `SqliteError` from SQLite driver/task APIs
  - Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
  - Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
  - Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
  - Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
  - Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
  - Updated Expo and op-sqlite drivers to match the new API
  - Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:
  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - The correct behavior is to let such failures throw and surface them through platform `createRun` global handlers (web, nodejs, react-native), which report uncaught errors via Evolu `console.error`.
  - Evolu also propagates `console.error` entries through its messaging layer into the shared `evoluError` global store, so app-level error subscriptions still receive these failures.

  Boundary handling:
  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- d30b95a: Refactored Time module for type safety, consistency, and better abstractions.

  **Type safety:**
  - Changed `Time.now()` return type from `number` to `Millis`
  - Added `Millis` branded type with efficient 6-byte serialization (max value: year 10889)
  - Added `minMillis` and `maxMillis` constants
  - `now()` now throw on invalid values for consistent error handling

  **Timer abstraction:**
  - Added `Time.setTimeout` and `Time.clearTimeout` for platform-agnostic timers
  - Added `TimeoutId` opaque type for timeout handles
  - Added `TestTime` interface with `advance()` for controllable time in tests
  - Added `testCreateTime` with `startAt` and `autoIncrement` options
  - Added `setTimeout(duration)` helper that returns a Promise

  **Duration literals:**
  - Renamed `DurationString` to `DurationLiteral`
  - Each duration has exactly one canonical form (e.g., "1000ms" must be written as "1s")
  - Added decimal support: "1.5s" (1500ms), "1.5h" (90 minutes)
  - Added weeks ("1w" to "51w") and years ("1y" to "99y")
  - Removed combination syntax ("1h 30m") in favor of decimals ("1.5h")
  - Months not supported (variable length)

  **UI responsiveness constants:**
  - `ms60fps` (16ms frame budget at 60fps)
  - `ms120fps` (8ms frame budget at 120fps)
  - `msLongTask` (50ms long task threshold for use with `yieldNow`)

  **Formatting utilities:**
  - Added `formatMillisAsDuration(millis)` - formats as human-readable duration (`1.234s`, `1m30.000s`, `1h30m45.000s`)
  - Added `formatMillisAsClockTime(millis)` - formats as clock time (`HH:MM:SS.mmm`)
  - Added `/*#__PURE__*/` annotation to `Millis` for better tree-shaking

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**
  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**
  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 9ba5442: Renamed `TransferableError` to `UnknownError` to better reflect its purpose as a wrapper for unknown errors caught at runtime, not just errors that need to be transferred between contexts
- c24ec2f: **Breaking:** Standard Schema validation now returns JSON-serialized errors instead of formatted messages

  Users who need human-readable messages should deserialize the error and format it using appropriate `TypeErrorFormatter`s:

  ```ts
  const result = MyType["~standard"].validate(input);
  if (!result.ok) {
    for (const issue of result.issues) {
      const error = JSON.parse(issue.message);
      const message = formatTypeError(error);
      // use message...
    }
  }
  ```

  This gives consumers full control over error formatting while keeping the Standard Schema integration simple.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:
  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Minor Changes

- 6fc3bba: Added `todo` function, a development placeholder that always throws

  Use to sketch function bodies before implementing them. TypeScript infers the return type from context, so surrounding code still type-checks. Use an explicit generic when there is no return type annotation.

  ```ts
  // Type inferred from return type annotation
  const fetchUser = (id: UserId): Result<User, FetchError> => todo();

  expectTypeOf(fetchUser).returns.toEqualTypeOf<Result<User, FetchError>>();

  // Explicit generic when no return type
  const getConfig = () => todo<Config>();

  expectTypeOf(getConfig).returns.toEqualTypeOf<Config>();
  ```

- 2f39c8e: Added new types and utilities to Types.ts:
  - `Awaitable<T>` - type for values that can be sync or async
  - `isPromiseLike` - type guard to check if a value is a PromiseLike
  - `Digit`, `Digit1To9`, `Digit1To6`, `Digit1To23`, `Digit1To51`, `Digit1To99`, `Digit1To59` - template literal types for numeric validation
  - `UnionToIntersection<U>` - converts a union to an intersection

  `Awaitable<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This type is useful for functions that may complete synchronously or asynchronously depending on runtime conditions.

  `isPromiseLike()` is a type guard to check if an Awaitable value is async, allowing conditional await only when necessary.

- ce83b24: Added `assertType` helper for asserting values against Evolu Types.

  Uses the Type name as the default error message to keep assertion failures readable.

  ```ts
  const length = buffer.getLength();
  assertType(NonNegativeInt, length, "buffer length should be non-negative");
  ```

- f0bbebb: Added `createObjectURL` helper for safe, disposable `URL.createObjectURL` usage using JS Resource management so the URL is disposed automatically when the scope ends.

  Example:

  ```ts
  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((data) => {
      using objectUrl = createObjectURL(
        new Blob([data], { type: "application/x-sqlite3" }),
      );

      const link = document.createElement("a");
      link.href = objectUrl.url;
      link.download = `${evolu.name}.sqlite3`;
      link.click();
    });
  };
  ```

- 332dfca: Added pull-based protocol types for modeling three-outcome operations

  New types and utilities for iterators and streams where completion is a normal outcome, not an error:
  - `Done<D>` - Signal type for normal completion with optional summary value
  - `done(value)` - Factory function to create Done instances
  - `NextResult<A, E, D>` - Result that can complete with value, error, or done
  - `nextResult(ok, err, done)` - Factory for creating NextResult Type instances
  - `UnknownNextResult` - Type instance for runtime `.is()` checks
  - `InferDone<R>` - Extracts the done value type from a NextResult
  - `NextTask<T, E, D>` - Task that can complete with value, error, or done
  - `InferTaskDone<T>` - Extracts the done value type from a NextTask

  The naming follows the existing pattern: `Result` → `NextResult`, `Task` → `NextTask`.

- 7da2364: Added Option module for distinguishing absence from nullable values.

  Use Option when the value itself can be `null` or `undefined`. For APIs where `null` means "not found", just use `T | null` directly.

  **Types:**
  - `Option<T>` — `Some<T> | None`
  - `Some<T>` — present value
  - `None` — absent value
  - `InferOption<O>` — extracts value type from Option or Some

  **Functions:**
  - `some(value)` — creates a Some
  - `none` — shared None instance
  - `isSome(option)` — type guard for Some
  - `isNone(option)` — type guard for None
  - `fromNullable(value)` — converts nullable to Option

- 6f1d6ea: Added `RandomNumber` branded type for type-safe random values
  - `RandomNumber` — branded `number` type for values in [0, 1) range
  - `Random.next()` now returns `RandomNumber` instead of `number`
  - Prevents accidentally passing arbitrary numbers where random values are expected

- 5f97e83: Added Result composition helpers for arrays and structs.
  - **`allResult`** — extracts all values from an array/struct of Results, returning the first error if any fails
  - **`mapResult`** — maps items to Results and extracts all values, returning the first error if any fails
  - **`anyResult`** — returns the first successful Result, or the last error if all fail

  ```ts
  // Extract values from array of Results
  const results = [ok(1), ok(2), ok(3)];
  const all = allResult(results); // ok([1, 2, 3])

  // Map items to Results
  const users = mapResult(userIds, fetchUser);
  // Result<ReadonlyArray<User>, FetchError>

  // First success wins
  const result = anyResult([err("a"), ok(42), err("b")]); // ok(42)

  // Struct support
  const struct = allResult({ a: ok(1), b: ok("two") });
  // ok({ a: 1, b: "two" })
  ```

- 3ba2a92: Added Schedule module for composable scheduling strategies.

  **Schedule** is a composable abstraction for retry, repeat, and rate limiting. Each schedule is a state machine: calling `schedule(deps)` creates a step function, and each `step(input)` returns `Ok([Output, Millis])` or `Err(Done<void>)` to stop.

  **Constructors:**
  - `forever` — never stops, no delay (base for composition)
  - `once` — runs exactly once
  - `recurs(n)` — runs n times
  - `spaced(duration)` — constant delay
  - `exponential(base, factor?)` — exponential backoff
  - `linear(base)` — linear backoff
  - `fibonacci(initial)` — Fibonacci backoff
  - `fixed(interval)` — window-aligned intervals
  - `windowed(interval)` — sleeps until next window boundary
  - `fromDelay(duration)` — single delay
  - `fromDelays(...durations)` — sequence of delays
  - `elapsed` — outputs elapsed time
  - `during(duration)` — runs for specified duration
  - `always(value)` — constant output
  - `unfoldSchedule(initial, next)` — state machine

  **Combinators:**
  - Limiting: `take`, `maxElapsed`, `maxDelay`
  - Delay: `jitter`, `delayed`, `addDelay`, `modifyDelay`, `compensate`
  - Filtering: `whileScheduleInput`, `untilScheduleInput`, `whileScheduleOutput`, `untilScheduleOutput`, `resetScheduleAfter`
  - Transform: `mapSchedule`, `passthrough`, `foldSchedule`, `repetitions`, `delays`
  - Collection: `collectAllScheduleOutputs`, `collectScheduleInputs`, `collectWhileScheduleOutput`, `collectUntilScheduleOutput`
  - Composition: `sequenceSchedules`, `intersectSchedules`, `unionSchedules`, `whenInput`
  - Side effects: `tapScheduleOutput`, `tapScheduleInput`

  **Presets:**
  - `retryStrategyAws` — exponential backoff (100ms base), max 2 retries, 20s cap, full jitter

- 5720b0b: Added Set module with type-safe helpers for immutable set operations.

  **Types:**
  - `NonEmptyReadonlySet<T>` — branded type for sets with at least one element (no mutable variant because `clear()`/`delete()` would break the guarantee)

  **Constants:**
  - `emptySet` — singleton empty set to avoid allocations

  **Type guards:**
  - `isNonEmptySet` — narrows to branded `NonEmptyReadonlySet`

  **Transformations:**
  - `addToSet` — returns branded non-empty set with item added
  - `deleteFromSet` — returns new set with item removed
  - `mapSet` — maps over set, preserves non-empty type
  - `filterSet` — filters set with predicate or refinement

  **Accessors:**
  - `firstInSet` — returns first element by insertion order (requires branded type)

- e948269: Added optional equality function to `Ref` and `ReadonlyStore` interface. `Ref.set` and `Ref.modify` now return `boolean` indicating whether state was updated. `Store` now uses `Ref` internally for state management.
- d1f817f: Added Resource management polyfills

  Provides `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`, and `AsyncDisposableStack` for environments without native support (e.g., Safari). This enables the `using` and `await using` declarations for automatic resource cleanup.

  Polyfills are installed automatically when importing `@evolu/common`.

  See `Result.test.ts` for usage patterns combining `Result` with `using`, `DisposableStack`, and `AsyncDisposableStack`.

- b956a5f: Added a new `StructuralMap` module for `Map`-like storage keyed by structural values instead of object identity.

  `StructuralMap` was added for cases where callers already had immutable keys such as JSON-like values, `undefined`, or `Uint8Array` and wanted to look up shared state, cached values, or in-flight work without maintaining a separate canonical string id. Structurally equal arrays, objects, and byte arrays addressed the same entry even when they were different JavaScript instances.

  `StructuralMap` worked by deriving a canonical structural id for each key and storing entries in a native `Map` keyed by that id. Repeated lookups of the same object, array, or `Uint8Array` instance reused cached ids through a `WeakMap`.

  ### Example

  ```ts
  import { createStructuralMap } from "@evolu/common";

  const map = createStructuralMap<
    { readonly id: string; readonly filter: readonly [string, string] },
    string
  >();

  map.set({ id: "items", filter: ["owner", "active"] }, "cached");

  map.get({ id: "items", filter: ["owner", "active"] });
  // => "cached"
  ```

- ece429b: Added Test module for deterministic testing with proper isolation.

  **New exports:**
  - `testCreateDeps()` - Creates fresh test deps per call for test isolation
  - `testCreateRun()` - Test Run with deterministic deps for reproducible fiber IDs, timestamps, and other generated values
  - `TestDeps` type extending `RunDeps` with `TestConsoleDep` (for test assertions) and `RandomLibDep` (for seeded randomness)Ø

  **Pattern:**

  ```ts
  test("my test", () => {
    const deps = testCreateDeps();
    const id = createId(deps);
    // Each test gets fresh, isolated deps
  });

  test("with custom seed", () => {
    const deps = testCreateDeps({ seed: "my-test" });
    // Reproducible randomness
  });
  ```

- 3b74e48: Added `result` Type factory and `typed` overload for props-less discriminants

  **Result Type factory:**
  - `result(okType, errType)` — creates a Type for validating serialized Results from storage, APIs, or message passing
  - `UnknownResult` — validates `Result<unknown, unknown>` for runtime `.is()` checks

  **typed overload:**
  - `typed(tag)` now accepts just a tag without props for simple discriminants like `typed("Pending")`
  - Added `TypedType<Tag, Props?>` helper type for the return type of `typed`

- 9373afa: Added `Typed` interface and `typed` factory for discriminated unions

  Discriminated unions model mutually exclusive states where each variant is a distinct type. This makes illegal states unrepresentable — invalid combinations cannot exist.

  ```ts
  // Type-only usage for static discrimination
  interface Pending extends Typed<"Pending"> {
    readonly createdAt: DateIso;
  }
  interface Shipped extends Typed<"Shipped"> {
    readonly trackingNumber: TrackingNumber;
  }
  type OrderState = Pending | Shipped;

  // Runtime validation with typed() factory
  const Pending = typed("Pending", { createdAt: DateIso });
  const Shipped = typed("Shipped", { trackingNumber: TrackingNumber });
  ```

### Patch Changes

- bfaa2ca: Added Listeners module for publish-subscribe notifications

  ### Example

  ```ts
  // Without payload (default)
  const listeners = createListeners();
  listeners.subscribe(() => console.log("notified"));
  listeners.notify();

  // With typed payload
  const listeners = createListeners<{ id: string }>();
  listeners.subscribe((event) => console.log(event.id));
  listeners.notify({ id: "123" });
  ```

## 7.4.1

### Patch Changes

- e1ed69a: Removed unnecessary assertions and simplified row validation in client storage row processing logic.

## 7.4.0

### Minor Changes

- 1479665: Added Redacted type for safely wrapping sensitive values
  - `Redacted<A>` wrapper prevents accidental exposure via logging, serialization, or inspection
  - `createRedacted(value)` creates a wrapper that returns `<redacted>` for toString/toJSON/inspect
  - `revealRedacted(redacted)` explicitly retrieves the hidden value
  - `isRedacted(value)` type guard for runtime checking
  - `createEqRedacted(eq)` creates equality for redacted values
  - Implements `Disposable` for automatic cleanup via `using` syntax
  - Type-level distinction via branded inner types (e.g., `Redacted<ApiKey>` ≠ `Redacted<DbPassword>`)

## 7.3.0

### Minor Changes

- d957af4: Added `getProperty` helper function

  Safely gets a property from a record, returning `undefined` if the key doesn't exist. TypeScript's `Record<K, V>` type assumes all keys exist, but at runtime accessing a non-existent key returns `undefined`. This helper provides proper typing for that case without needing a type assertion.

  ```ts
  const users: Record<string, User> = { alice: { name: "Alice" } };
  const user = getProperty(users, "bob"); // User | undefined
  ```

- a21a9fa: Added `set` Type factory

  The `set` factory creates a Type for validating `Set` instances with typed elements. It validates that the input is a `Set` and that all elements conform to the specified element type.

  ```ts
  const NumberSet = set(Number);

  const result1 = NumberSet.from(new Set([1, 2, 3])); // ok(Set { 1, 2, 3 })
  const result2 = NumberSet.from(new Set(["a", "b"])); // err(...)
  ```

- 604940a: Added `readonly` helper function

  The `readonly` function casts arrays, sets, records, and maps to their readonly counterparts with zero runtime cost. It preserves `NonEmptyArray` as `NonEmptyReadonlyArray` and provides proper type inference for all supported collection types.

### Patch Changes

- a04e86e: Update Result documentation with block scope pattern for multiple void operations

  ```ts
  // Before - inventing names to avoid name clash
  const baseTables = createBaseSqliteStorageTables(deps);
  if (!baseTables.ok) return baseTables;

  const relayTables = createRelayStorageTables(deps);
  if (!relayTables.ok) return relayTables;

  // After - block scopes avoid name clash
  {
    const result = createBaseSqliteStorageTables(deps);
    if (!result.ok) return result;
  }
  {
    const result = createRelayStorageTables(deps);
    if (!result.ok) return result;
  }
  ```

- 5f5a867: Fix forward compatibility by quarantining messages with unknown schema

  Messages with unknown tables or columns are now stored in `evolu_message_quarantine` table instead of being discarded. This fixes an issue where apps had to be updated to receive messages from newer versions. The quarantine table is queryable via `createQuery` and quarantined messages are automatically applied when the schema is updated.

## 7.2.3

### Patch Changes

- adfd6af: Add a typed helper `createRecord` for safely creating prototype-less
  `Record<K, V>` instances (via `Object.create(null)`). This prevents
  prototype pollution and accidental key collisions for object keys that come
  from external sources, like database column names.
- 7e7a191: Fix handling of empty-update mutations and readDbChange

  This patch fixes a bug where a mutation that contains only an `id` (no values) could result in an empty set of `evolu_history` rows for the corresponding timestamp. That caused `readDbChange` to fail when trying to build a CRDT change for syncing. The fix ensures `evolu_history` includes system columns so the storage and sync code always have at least one column to work with.

  Manually tested and snapshots updated.

  Manual verification steps: call `update("todo", { id })` and then invoke
  `readDbChange` via the sync with an empty relay.

## 7.2.2

### Patch Changes

- 37e653c: Improve Owner API documentation and consistency
  - Add `ReadonlyOwner` interface for owners without write keys
  - Export `UnuseOwner` type for better API clarity
  - Improve JSDoc comments across Owner types and related interfaces
  - Rename `BaseOwnerError` to `OwnerError` for consistency
  - Remove `createOwner` from public exports (use specific owner creation functions)
  - Remove transport properties from owner types (now passed via `useOwner`)
  - Add documentation for `OwnerWriteKey` rotation
  - Improve `useOwner` documentation in React and Vue hooks

- de00f0c: Prevent redundant WebSocket close calls

  Added a check to ensure socket.close() is only called if the WebSocket is not already closing or closed, preventing unnecessary operations and potential errors.

## 7.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

## 7.2.0

### Minor Changes

- 0830d8b: Add `popArray` function for removing and returning the last element from a non-empty mutable array.

  This complements the existing `shiftArray` function by providing symmetric mutable operations for both ends of arrays. The function ensures type safety by only accepting mutable non-empty arrays and guaranteeing a return value.

## 7.1.0

### Minor Changes

- be0ad00: Added `partitionArray` function and refinement support to `filterArray`.
  - New `partitionArray` function partitions arrays returning a tuple of matched/unmatched with type narrowing support
  - Enhanced `filterArray` with refinement overloads for type-safe filtering (e.g., `PositiveInt.is`)
  - Added `PredicateWithIndex` and `RefinementWithIndex` types for index-aware predicates and type guards
  - Improved documentation and cleaned up module headers

## 7.0.0

### Major Changes

- 36af10c: Improved Array helpers

  Evolu Array helpers for type-safe immutable operations have been improved. See [Array](https://www.evolu.dev/docs/api-reference/common/Array) docs.

- 6452d57: Non-initiator always responds in sync protocol for completion feedback

  The non-initiator (relay) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables sync completion detection for initiators (clients).

- eec5d8e: Add Task, async helpers, and concurrency primitives
  - `Task<T, E>` - Lazy, cancellable Promise that returns typed Result instead of throwing
  - `toTask()` - Convert async functions to Tasks with AbortSignal support
  - `wait()` - Delay execution with Duration strings (e.g., "5m", "2h 30m")
  - `timeout()` - Add timeout behavior to any Task
  - `retry()` - Retry failed operations with exponential backoff and jitter
  - `createSemaphore()` - Limit concurrent operations to a specified count
  - `createMutex()` - Ensure mutual exclusion (one operation at a time)

  **Duration Support:**
  - Type-safe duration strings with compile-time validation
  - Support for milliseconds, seconds, minutes, hours, and days
  - Logical combinations like "1h 30m" or "2s 500ms"

  Tasks provide precise type safety for cancellation - AbortError is only included in the error union when an AbortSignal is actually provided. All operations are designed to work together seamlessly for complex async workflows.

  ## Examples

  ### toTask

  ```ts
  // Convert an async function to a Task<Result<T, E>> with AbortSignal support
  const fetchTask = (url: string) =>
    toTask((context) =>
      tryAsync(
        () => fetch(url, { signal: context?.signal ?? null })
        (error) => ({ type: "FetchError", error }),
      ),
    );

  const result = await fetchTask("/api")(/* optional: { signal } */);
  ```

  ### wait

  ```ts
  // Delay for a duration string or NonNegativeInt milliseconds
  await wait("50ms")();
  ```

  ### timeout

  ```ts
  const slow = toTask(async () => ok("done"));
  const withTimeout = timeout("200ms", slow);
  const r = await withTimeout(); // Result<string, TimeoutError>
  ```

  ### retry

  ```ts
  interface FetchError {
    readonly type: "FetchError";
    readonly error: unknown;
  }
  const task = fetchTask("/api");
  const withRetry = retry({ retries: PositiveInt.orThrow(3) }, task);
  const r = await withRetry(); // Result<Response, FetchError | RetryError<FetchError>>
  ```

  ### createSemaphore

  ```ts
  const semaphore = createSemaphore(3);
  const run = (i: number) =>
    semaphore.withPermit(() => wait("50ms")().then(() => i));
  const results = await Promise.all([1, 2, 3, 4, 5].map(run)); // [1,2,3,4,5]
  ```

  ### createMutex

  ```ts
  const mutex = createMutex();
  const seq = (i: number) =>
    mutex.withLock(async () => {
      await wait("10ms")();
      return i;
    });
  const results = await Promise.all([1, 2, 3].map(seq)); // executes one at a time
  ```

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- 8f0c0d3: Refined system (formerly "default") createdAt column handling

  ### Summary
  - `createdAt` is now derived exclusively from the CRDT `Timestamp`. It is injected automatically only on first insert. You can no longer provide `createdAt` in `upsert` mutation – doing so was an anti‑pattern and is now validated against.
  - Introduced `isInsert` flag to `DbChange` to distinguish initial row creation from subsequent updates; this drives automatic `createdAt` population.
  - Added `ValidDbChangeValues` type to reject system columns (`createdAt`, `updatedAt`, `id`) while allowing `isDeleted`.
  - Clock storage changed from sortable string (`TimestampString`) to compact binary (`blob`) representation for space efficiency and fewer conversions.
  - Removed `timestampToTimestampString` / `timestampStringToTimestamp`; added `timestampToDateIso` for converting CRDT timestamps to ISO dates.
  - Schema validation wording updated: "default column" -> "system column" for clarity.
  - Internal protocol encoding updated (tests reflect new binary clock and flag ordering); snapshots adjusted accordingly.

  ### Notes
  - This change reduces payload size (e.g. from 113 to 97).

- eec5d8e: Replace Mnemonic with OwnerSecret

  OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.

- 6759c31: Rename `ManyToManyMap` to `Relation`.
  - `ManyToManyMap<K, V>` → `Relation<A, B>`
  - `createManyToManyMap` → `createRelation`
  - `getValues` / `getKeys` → `getB` / `getA`
  - `hasPair` / `hasKey` / `hasValue` → `has` / `hasA` / `hasB`
  - `deleteKey` / `deleteValue` → `deleteA` / `deleteB`
  - `keyCount` / `valueCount` / `pairCount` → `aCount` / `bCount` / `size`

- eec5d8e: Replace NanoID with Evolu Id

  Evolu now uses its own ID format instead of NanoID:
  - **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
  - **Breaking change**: ID format changes from 21 to 22 characters
  - **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID, and native Base64Url encoding support across platforms

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- eec5d8e: Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

  The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

  **Breaking changes:**
  - Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
  - Removed `useAppOwner()` hook from `@evolu/react`
  - Added `evolu.appOwner` promise that resolves to `AppOwner`
  - Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

  **Migration:**

  ```ts
  // Before
  const unsubscribe = evolu.subscribeAppOwner(() => {
    const owner = evolu.getAppOwner();
  });

  // After
  const owner = await evolu.appOwner;
  ```

  For React, use the `use` hook:

  ```ts
  // Before
  import { useAppOwner } from "@evolu/react";
  const appOwner = useAppOwner();

  // After
  import { use } from "react";
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  ```

- 0911302: Enhance message integrity by embedding timestamps in encrypted data

  This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.

- 0777577: Add `ownerId` system column and strict app tables without rowid
  - Add `ownerId` as a system column to all application tables and include it in the primary key.
  - Create app tables as strict, without rowid, and using `any` affinity for user columns to preserve data exactly as stored.
  - Make soft deletes explicit in the sync protocol so `isDeleted` changes are propagated and replayed consistently across devices.

- eec5d8e: # Transport-Based Configuration System

  **BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

  ## What Changed
  - **Removed** `syncUrl` property from Evolu config
  - **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
  - **Added** `Transport` type union with initial WebSocket support
  - **Updated** sync system to support Nostr-style relay pools with simultaneous connections
  - **Updated** all examples and documentation to use new transport configuration

  ## Migration Guide

  **Before:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    syncUrl: "wss://relay.example.com",
  });
  ```

  **After (single transport):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: { type: "WebSocket", url: "wss://relay.example.com" },
  });
  ```

  **After (multiple transports):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: [
      { type: "WebSocket", url: "wss://relay1.example.com" },
      { type: "WebSocket", url: "wss://relay2.example.com" },
    ],
  });
  ```

  ## Benefits
  - **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
  - **Intuitive API**: Singular property name that accepts both single item and array
  - **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
  - **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
  - **Type safety**: Full TypeScript support for transport configurations

  ## Future Transport Types

  The new system is designed to support upcoming transport types:
  - `FetchRelay`: HTTP-based polling for environments without WebSocket support
  - `Bluetooth`: P2P sync for offline collaboration
  - `LocalNetwork`: LAN/mesh sync for local networks

  ## Technical Details
  - Single transports are automatically normalized to arrays internally
  - CRDT messages are sent to all connected transports simultaneously
  - Duplicate message handling relies on CRDT idempotency (no deduplication needed)
  - WebSocket connections auto-reconnect independently
  - Backwards compatibility removed (preview version breaking change)

  This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.

- de37bd1: Add `ownerId` to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.
  - Improved protocol documentation for versioning and error handling.
  - Improved E2E tests for protocol version negotiation.
  - Ensured all protocol errors (except for malformed data) are associated with the correct owner.

- 3daa221: Add protocol versioning to EncryptedDbChange

  Protocol version is now encoded as the first field in EncryptedDbChange binary format.

- 05fe5d5: Renaming
  - `CallbackRegistry` → `Callbacks`
  - `createCallbackRegistry` → `createCallbacks`
  - `RefCountedResourceManager` → `Resources`
  - `createRefCountedResourceManager` → `createResources`
  - `ResourceManagerConfig` → `ResourcesConfig`

- 4a82c06: Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.
  - Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
  - After: `new Error("getOrThrow failed", { cause: err })`

  Why:
  - Preserve structured business errors for machine parsing via `error.cause`.
  - Avoid brittle stringified error messages and preserve a proper stack trace.

### Minor Changes

- 2f87ac8: Improve Array module docs and refactor helpers.

  **Improvements:**
  - Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
  - Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
  - Add `@category` JSDoc tags to all exported items for better TypeDoc organization
  - Add `### Example` sections to all functions with practical usage demonstrations
  - Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

- 47386b8: Add booleanToSqliteBoolean and sqliteBooleanToBoolean helpers
- 202eaa3: Evolu Relay storage made stateless

  Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

  The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

  Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database.

- 13b688f: Add MaybeAsync type and isAsync type guard

  `MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

  `isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.

- a1dfb7a: Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

  ```ts
  dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

  dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
  ```

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

- 4a960c7: Add optional `createIdAsUuidv7` helper for timestamp‑embedded IDs (UUID v7 layout) while keeping `createId` as the privacy‑preserving default.

  Simplified Id documentation to clearly present the three creation paths:
  - `createId` (random, recommended)
  - `createIdFromString` (deterministic mapping via SHA‑256 first 16 bytes)
  - `createIdAsUuidv7` (timestamp bits for index locality; leaks creation time)

- 6279aea: Add external ID support with `createIdFromString` function
  - Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
  - Add optional branding support to both `createId` and `createIdFromString` functions
  - Update FAQ documentation with external ID integration examples

- 02e8aa0: Evolu identicons

  Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

  ### Features
  - **Multiple styles**: Choose from 4 styles:
    - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
    - `"quadrant"`: 2×2 color block grid with direct RGB mapping
    - `"gradient"`: Diagonal stripe pattern with smooth color gradients
    - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
  - **SVG output**: Returns SVG string that can be used directly

  ### Example

  ```ts
  import { createIdenticon } from "@evolu/common";

  // Basic usage with default GitHub style
  const svg = createIdenticon(userId);

  const quadrant = createIdenticon(ownerId, "quadrant");
  const gradient = createIdenticon(postId, "gradient");
  const sutnar = createIdenticon(teamId, "sutnar");
  ```

- f5e4232: Added deleteOwner(ownerId) method to the Storage interface and implementations, enabling complete removal of all data for a given owner, including timestamps, messages, and write keys.
- 31d0d21: Add Cache module with generic cache interface and LRU cache implementation
  - New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
  - New `createLruCache` factory function for creating LRU caches with configurable capacity
  - Keys are compared by reference (standard Map semantics)
  - LRU cache automatically evicts least recently used entries when capacity is reached
  - Both `get` and `set` operations update access order
  - Exposes readonly `map` property for iteration and inspection

  Example:

  ```ts
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Evicts "a"
  cache.has("a"); // false
  ```

- 29886ff: Add Standard Schema V1 support

  [Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

  ```ts
  const User = object({
    name: NonEmptyTrimmedString100,
    age: Number,
  });

  const result = User["~standard"].validate({
    name: "Alice",
    age: "not a number",
  });
  // {
  //   issues: [
  //     {
  //       message: 'A value "not a number" is not a number.',
  //       path: ["age"],
  //     },
  //   ],
  // }
  ```

  All error messages have been standardized for consistency.

- 1d8c439: Add `orNull` method to Evolu Type

  Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

  ```ts
  const age = PositiveInt.orNull(userInput) ?? 0;
  ```

- eed43d5: Add `firstInArray` and `lastInArray` helpers

  New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.

## 6.0.1-preview.35

### Patch Changes

- 47386b8: Add booleanToSqliteBoolean and sqliteBooleanToBoolean helpers
- 4a960c7: Add optional `createIdAsUuidv7` helper for timestamp‑embedded IDs (UUID v7 layout) while keeping `createId` as the privacy‑preserving default.

  Simplified Id documentation to clearly present the three creation paths:
  - `createId` (random, recommended)
  - `createIdFromString` (deterministic mapping via SHA‑256 first 16 bytes)
  - `createIdAsUuidv7` (timestamp bits for index locality; leaks creation time)

- 0777577: Add ownerId system column and strict app tables
  - Add `ownerId` as a system column to all application tables and include it in the primary key.
  - Create app tables as strict, without rowid, and using `any` affinity for user columns to preserve data exactly as stored.
  - Make soft deletes explicit in the sync protocol so `isDeleted` changes are propagated and replayed consistently across devices.

## 6.0.1-preview.34

### Patch Changes

- 8f0c0d3: Refined system (formerly "default") createdAt column handling

  ### Summary
  - `createdAt` is now derived exclusively from the CRDT `Timestamp`. It is injected automatically only on first insert. You can no longer provide `createdAt` in `upsert` mutation – doing so was an anti‑pattern and is now validated against.
  - Introduced `isInsert` flag to `DbChange` to distinguish initial row creation from subsequent updates; this drives automatic `createdAt` population.
  - Added `ValidDbChangeValues` type to reject system columns (`createdAt`, `updatedAt`, `id`) while allowing `isDeleted`.
  - Clock storage changed from sortable string (`TimestampString`) to compact binary (`blob`) representation for space efficiency and fewer conversions.
  - Removed `timestampToTimestampString` / `timestampStringToTimestamp`; added `timestampToDateIso` for converting CRDT timestamps to ISO dates.
  - Schema validation wording updated: "default column" -> "system column" for clarity.
  - Internal protocol encoding updated (tests reflect new binary clock and flag ordering); snapshots adjusted accordingly.

  ### Notes
  - This change reduces payload size (e.g. from 113 to 97).

## 6.0.1-preview.33

### Patch Changes

- 2f87ac8: Improve Array module docs and refactor helpers.

  **Improvements:**
  - Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
  - Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
  - Add `@category` JSDoc tags to all exported items for better TypeDoc organization
  - Add `### Example` sections to all functions with practical usage demonstrations
  - Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays

## 6.0.1-preview.32

### Patch Changes

- a1dfb7a: Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

  ```ts
  dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

  dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
  ```

## 6.0.1-preview.31

### Patch Changes

- 202eaa3: Evolu Relay storage made stateless

  Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

  The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

  Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database. The core logic is implemented in the language which is very fast and where data is, which is why it's not Rust but SQL 🤓

- eed43d5: Add firstInArray and lastInArray helpers

  New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.

## 6.0.1-preview.30

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- 05fe5d5: Renaming
  - `CallbackRegistry` → `Callbacks`
  - `createCallbackRegistry` → `createCallbacks`
  - `RefCountedResourceManager` → `Resources`
  - `createRefCountedResourceManager` → `createResources`
  - `ResourceManagerConfig` → `ResourcesConfig`

## 6.0.1-preview.29

### Patch Changes

- 36af10c: Improved Array helpers

  Evolu Array helpers for type-safe immutable operations have been improved. See [Array](https://www.evolu.dev/docs/api-reference/common/Array) docs.

- 91c132c: Multiton → Instances

  Multiton has been renamed to Instances with improved API and documentation.
  - `createMultiton` → `createInstances`
  - `disposeInstance` → `delete`
  - Enhanced error handling with AggregateError for multiple disposal failures
  - Clearer documentation focusing on practical use cases (mutexes, hot reloading)

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

- 13b688f: Add MaybeAsync type and isAsync type guard

  `MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

  `isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.

## 6.0.1-preview.28

### Patch Changes

- 7216d47: Add Multiton

  Multiton manages multiple named instances using a key-based registry with structured disposal. It's used internally for Evolu instance caching to support hot reloading and prevent database corruption from multiple connections.

  See the Multiton documentation for usage patterns and caveats.

## 6.0.1-preview.27

### Patch Changes

- a957aa0: Refactor React Native package structure and remove react-native-quick-base64 dependency

  **Breaking Changes:**
  - Package exports reorganized: use `/expo-sqlite`, `/expo-op-sqlite`, or `/bare-op-sqlite` instead of `/expo-sqlite` and `/op-sqlite`
  - Updated quickstart documentation to reflect new import paths

  **@evolu/react-native:**
  - Reorganized package structure with exports in dedicated `/exports` directory
  - Move SQLite driver implementations into `/sqlite-drivers` directory
  - Created shared dependency initialization in `shared.ts`
  - Removed `react-native-quick-base64` dependency (no longer needed)
  - Added `createExpoDeps.ts` for Expo-specific configuration including SecureStore integration
  - Updated `package.json` exports to include three entry points:
    - `/expo-sqlite` - for Expo projects using expo-sqlite
    - `/expo-op-sqlite` - for Expo projects using @op-engineering/op-sqlite
    - `/bare-op-sqlite` - for bare React Native projects using @op-engineering/op-sqlite
  - Reorganized imports following project guidelines (named imports, top-down organization)

  **@evolu/common:**
  - Added `Platform.ts` module with platform detection utilities
  - Refactored `LocalAuth.ts` constants to follow naming conventions:
    - `AUTH_NAMESPACE` → `localAuth_Namespace`
    - `AUTH_DEFAULT_OPTIONS` → `localAuthDefaultOptions`
    - `AUTH_METAKEY_LAST_OWNER` → `localAuthMetakeyLastOwner` (private)
    - `AUTH_METAKEY_OWNER_NAMES` → `localAuthMetakeyOwnerNames` (private)

  **Documentation:**
  - Updated quickstart guide to remove `react-native-quick-base64` from installation instructions
  - Simplified Expo setup warnings and instructions
  - Updated React Native import example to use `/bare-op-sqlite` path

## 6.0.1-preview.26

### Patch Changes

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- 02e8aa0: Evolu identicons

  Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

  ### Features
  - **Multiple styles**: Choose from 4 styles:
    - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
    - `"quadrant"`: 2×2 color block grid with direct RGB mapping
    - `"gradient"`: Diagonal stripe pattern with smooth color gradients
    - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
  - **SVG output**: Returns SVG string that can be used directly

  ### Example

  ```ts
  import { createIdenticon } from "@evolu/common";

  // Basic usage with default GitHub style
  const svg = createIdenticon(userId);

  const quadrant = createIdenticon(ownerId, "quadrant");
  const gradient = createIdenticon(postId, "gradient");
  const sutnar = createIdenticon(teamId, "sutnar");
  ```

- 31d0d21: Add Cache module with generic cache interface and LRU cache implementation
  - New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
  - New `createLruCache` factory function for creating LRU caches with configurable capacity
  - Keys are compared by reference (standard Map semantics)
  - LRU cache automatically evicts least recently used entries when capacity is reached
  - Both `get` and `set` operations update access order
  - Exposes readonly `map` property for iteration and inspection

  Example:

  ```ts
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Evicts "a"
  cache.has("a"); // false
  ```

## 6.0.1-preview.25

### Patch Changes

- 29886ff: Add Standard Schema V1 support

  [Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

  ```ts
  const User = object({
    name: NonEmptyTrimmedString100,
    age: Number,
  });

  const result = User["~standard"].validate({
    name: "Alice",
    age: "not a number",
  });
  // {
  //   issues: [
  //     {
  //       message: 'A value "not a number" is not a number.',
  //       path: ["age"],
  //     },
  //   ],
  // }
  ```

  All error messages have been standardized for consistency.

## 6.0.1-preview.24

### Patch Changes

- 1d8c439: Add `orNull` method to Evolu Type

  Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

  ```ts
  const age = PositiveInt.orNull(userInput) ?? 0;
  ```

## 6.0.1-preview.23

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export

## 6.0.1-preview.22

### Patch Changes

- 446eac5: Remove dead code comments and improve tests
  - Simplify JSDoc for `loadQuery` to focus on current behavior (caching for Suspense)
  - Add note about SSR behavior to `appOwner`
  - Improve `createEvolu` JSDoc with clearer description and instance caching behavior
  - Improve tests to use proper async/await patterns and avoid mock libraries
  - Add comprehensive test coverage for query loading, subscriptions, and cache behavior

## 6.0.1-preview.21

### Patch Changes

- d913cf9: Add relay authentication support with `authenticateOwner` callback
  - Add `createWebSocketTransportConfig` helper to create WebSocket transports with OwnerId for relay authentication
  - Add `parseOwnerIdFromUrl` to extract OwnerId from URL query strings on relay side
  - Add `authenticateOwner` callback to `RelayConfig` for controlling relay access by OwnerId
  - Add comprehensive relay logging with `createRelayLogger`
  - Refactor `createNodeJsRelay` to return `Result<Relay, SqliteError>` for proper error handling
  - Add HTTP upgrade authentication flow with appropriate status codes (400, 401, 500)
  - Rename `createRelayStorage` to `createRelaySqliteStorage` for clarity
  - Add `ProtocolQuotaExceededError` for storage/billing quota management (placeholder for future implementation)
  - Improve transport configuration documentation with redundancy best practices

## 6.0.1-preview.20

### Patch Changes

- eec5d8e: Add Task, async helpers, and concurrency primitives
  - `Task<T, E>` - Lazy, cancellable Promise that returns typed Result instead of throwing
  - `toTask()` - Convert async functions to Tasks with AbortSignal support
  - `wait()` - Delay execution with Duration strings (e.g., "5m", "2h 30m")
  - `timeout()` - Add timeout behavior to any Task
  - `retry()` - Retry failed operations with exponential backoff and jitter
  - `createSemaphore()` - Limit concurrent operations to a specified count
  - `createMutex()` - Ensure mutual exclusion (one operation at a time)

  **Duration Support:**
  - Type-safe duration strings with compile-time validation
  - Support for milliseconds, seconds, minutes, hours, and days
  - Logical combinations like "1h 30m" or "2s 500ms"

  Tasks provide precise type safety for cancellation - AbortError is only included in the error union when an AbortSignal is actually provided. All operations are designed to work together seamlessly for complex async workflows.

  ## Examples

  ### toTask

  ```ts
  // Convert an async function to a Task<Result<T, E>> with AbortSignal support
  const fetchTask = (url: string) =>
    toTask((context) =>
      tryAsync(
        () => fetch(url, { signal: context?.signal ?? null })
        (error) => ({ type: "FetchError", error }),
      ),
    );

  const result = await fetchTask("/api")(/* optional: { signal } */);
  ```

  ### wait

  ```ts
  // Delay for a duration string or NonNegativeInt milliseconds
  await wait("50ms")();
  ```

  ### timeout

  ```ts
  const slow = toTask(async () => ok("done"));
  const withTimeout = timeout("200ms", slow);
  const r = await withTimeout(); // Result<string, TimeoutError>
  ```

  ### retry

  ```ts
  interface FetchError {
    readonly type: "FetchError";
    readonly error: unknown;
  }
  const task = fetchTask("/api");
  const withRetry = retry({ retries: PositiveInt.orThrow(3) }, task);
  const r = await withRetry(); // Result<Response, FetchError | RetryError<FetchError>>
  ```

  ### createSemaphore

  ```ts
  const semaphore = createSemaphore(3);
  const run = (i: number) =>
    semaphore.withPermit(() => wait("50ms")().then(() => i));
  const results = await Promise.all([1, 2, 3, 4, 5].map(run)); // [1,2,3,4,5]
  ```

  ### createMutex

  ```ts
  const mutex = createMutex();
  const seq = (i: number) =>
    mutex.withLock(async () => {
      await wait("10ms")();
      return i;
    });
  const results = await Promise.all([1, 2, 3].map(seq)); // executes one at a time
  ```

- eec5d8e: Replace Mnemonic with OwnerSecret

  OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.

- eec5d8e: Replace NanoID with Evolu Id

  Evolu now uses its own ID format instead of NanoID:
  - **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
  - **Breaking change**: ID format changes from 21 to 22 characters
  - **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID (128 bits vs ~126 bits), and native Base64Url encoding support across platforms

  See the `Id` type documentation for detailed design rationale comparing to NanoID, UUID v4, and UUID v7.

- eec5d8e: Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

  The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

  **Breaking changes:**
  - Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
  - Removed `useAppOwner()` hook from `@evolu/react`
  - Added `evolu.appOwner` promise that resolves to `AppOwner`
  - Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

  **Migration:**

  ```ts
  // Before
  const unsubscribe = evolu.subscribeAppOwner(() => {
    const owner = evolu.getAppOwner();
  });

  // After
  const owner = await evolu.appOwner;
  ```

  For React, use the `use` hook:

  ```ts
  // Before
  import { useAppOwner } from "@evolu/react";
  const appOwner = useAppOwner();

  // After
  import { use } from "react";
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  ```

- eec5d8e: # Transport-Based Configuration System

  # Transport-Based Configuration System

  **BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

  ## What Changed
  - **Removed** `syncUrl` property from Evolu config
  - **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
  - **Added** `Transport` type union with initial WebSocket support
  - **Updated** sync system to support Nostr-style relay pools with simultaneous connections
  - **Updated** all examples and documentation to use new transport configuration

  ## Migration Guide

  **Before:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    syncUrl: "wss://relay.example.com",
  });
  ```

  **After (single transport):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: { type: "WebSocket", url: "wss://relay.example.com" },
  });
  ```

  **After (multiple transports):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: [
      { type: "WebSocket", url: "wss://relay1.example.com" },
      { type: "WebSocket", url: "wss://relay2.example.com" },
    ],
  });
  ```

  ## Benefits
  - **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
  - **Intuitive API**: Singular property name that accepts both single item and array
  - **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
  - **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
  - **Type safety**: Full TypeScript support for transport configurations

  ## Future Transport Types

  The new system is designed to support upcoming transport types:
  - `FetchRelay`: HTTP-based polling for environments without WebSocket support
  - `Bluetooth`: P2P sync for offline collaboration
  - `LocalNetwork`: LAN/mesh sync for local networks

  ## Technical Details
  - Single transports are automatically normalized to arrays internally
  - CRDT messages are sent to all connected transports simultaneously
  - Duplicate message handling relies on CRDT idempotency (no deduplication needed)
  - WebSocket connections auto-reconnect independently
  - Backwards compatibility removed (preview version breaking change)

  This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.

## 6.0.1-preview.19

### Patch Changes

- a2551db: Add deriveSlip21Node

## 6.0.1-preview.18

### Patch Changes

- 2f30dcd: Update deps
- 4a82c06: Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.
  - Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
  - After: `new Error("getOrThrow failed", { cause: err })`

  Why:
  - Preserve structured business errors for machine parsing via `error.cause`.
  - Avoid brittle stringified error messages and preserve a proper stack trace.

  Migration:
  - If you matched error messages, switch to inspecting `error.cause`.

## 6.0.1-preview.17

### Patch Changes

- 6eca947: Replace initialData with onInit callback
  - Remove `initialData` function from Config interface
  - Add `onInit` callback with `isFirst` parameter for one-time initialization
  - Simplify database initialization by removing pre-init data handling
  - Provide better control over initialization lifecycle

## 6.0.1-preview.16

### Patch Changes

- af1e668: # Owners refactor and external AppOwner support

  ## 🚀 Features
  - **External AppOwner Support**: `AppOwner` can now be created from external keys without sharing the mnemonic with the Evolu app. The `mnemonic` property is now optional, allowing for better security when integrating with external authentication systems.
  - **New Config Option**: Added `initialAppOwner` configuration option to specify a pre-existing AppOwner when creating an Evolu instance, replacing the previous `mnemonic` option for better encapsulation.

  ## 🔄 Breaking Changes
  - **Owner API Redesign**: Complete refactor of the Owner system with cleaner, more focused interfaces:
    - Simplified `Owner` interface with only essential properties (`id`, `encryptionKey`, `writeKey`)
    - Removed temporal properties (`createdAt`, `timestamp`) from core Owner interface
    - Eliminated complex `OwnerRow` and `OwnerWithWriteAccess` types
  - **Database Schema Changes**:
    - Replaced `evolu_owner` table with streamlined `evolu_config` table
    - New `evolu_version` table for protocol versioning
    - Simplified storage of AppOwner data in single config row
  - **Configuration Changes**:
    - `Config.mnemonic` replaced with `Config.initialAppOwner`
    - More explicit control over owner initialization

  ## ✨ Improvements
  - **Enhanced Documentation**: Comprehensive JSDoc with clear explanations of owner types, use cases, and examples
  - **Clock Management**: New internal clock system for better timestamp handling
  - **Test Coverage**: Extensive test suite covering all owner types and edge cases

  ## 🔧 Internal Changes
  - **Database Initialization**: Refactored database setup to use new schema with better separation of concerns
  - **Protocol Updates**: Updated to protocol version 0 with new storage format

## 6.0.1-preview.15

### Patch Changes

- 6452d57: Non-initiator always responds in sync protocol for completion feedback

  The non-initiator (relay/server) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables reliable sync completion detection for initiators (clients).

## 6.0.1-preview.14

### Patch Changes

- 0911302: Enhance message integrity by embedding timestamps in encrypted data
  - Add timestamp tamper-proofing to encrypted CRDT messages by embedding the timestamp within the encrypted payload
  - Update `encodeAndEncryptDbChange` to accept `CrdtMessage` instead of `DbChange` and include timestamp in encrypted data
  - Update `decryptAndDecodeDbChange` to verify embedded timestamp matches expected timestamp
  - Add `ProtocolTimestampMismatchError` for timestamp verification failures
  - Export `eqTimestamp` equality function for timestamp comparison
  - Add `timestampBytesLength` constant for consistent binary timestamp size
  - Fix `Db.ts` to pass complete `CrdtMessage` to encryption functions
  - Add test for timestamp tamper-proofing scenarios

  This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.

- 3daa221: Add protocol versioning to EncryptedDbChange

  Protocol version is now encoded as the first field in EncryptedDbChange binary format. This enables safe evolution of the format while maintaining backward compatibility.

## 6.0.1-preview.13

### Patch Changes

- c4fb4b0: Docs for insert, update, and upsert methods
- e213d63: Improve createdAt handling in mutations

  This release enhances the handling of the `createdAt` column in Evolu mutations, providing more flexibility for data migrations and external system integrations while maintaining distributed system semantics.

  ### Changes

  **createdAt Behavior:**
  - `insert`: Always sets `createdAt` to current timestamp
  - `upsert`: Sets `createdAt` to current timestamp if not provided, or uses custom value if specified
  - `update`: Never sets `createdAt` (unchanged behavior)

  **Documentation Improvements:**
  - Updated JSDoc for `DefaultColumns` with clear explanations of each column's behavior
  - Clarified that `updatedAt` is always set by Evolu and derived from CrdtMessage timestamp
  - Added guidance for using custom timestamp columns when deferring sync for privacy
  - Enhanced mutation method documentation with practical examples

  ### Example

  ```ts
  evolu.upsert("todo", {
    id: externalId,
    title: "Migrated todo",
    createdAt: new Date("2023-01-01"), // Preserve original timestamp
  });
  ```

## 6.0.1-preview.12

### Patch Changes

- 3e824af: Refactor createIdFromString, add tests

## 6.0.1-preview.11

### Patch Changes

- 6279aea: Add external ID support with `createIdFromString` function
  - Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
  - Add optional branding support to both `createId` and `createIdFromString` functions
  - Update FAQ documentation with external ID integration examples
  - Add tests for new functionality

  This enables deterministic ID generation from external systems while maintaining Evolu's 21-character NanoID format requirement and ensuring consistent conflict resolution across distributed clients.

## 6.0.1-preview.10

### Patch Changes

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

## 6.0.1-preview.9

### Patch Changes

- 7283ca1: Don't rethrow the decode error

## 6.0.1-preview.8

### Patch Changes

- 04ca08f: Update default syncUrl

## 6.0.1-preview.7

### Patch Changes

- f5e4232: Added deleteOwner(ownerId) method to the Storage interface and implementations, enabling complete removal of all data for a given owner, including timestamps, messages, and write keys.

## 6.0.1-preview.6

### Patch Changes

- 7cd78bf: Added WriteKey rotation protocol support
  - Added WriteKeyMode enum for protocol header (None/Single/Rotation)
  - Updated protocol message structure with separate initiator/non-initiator headers
  - Added createProtocolMessageForWriteKeyRotation function
  - Added storage interface setWriteKey method

## 6.0.1-preview.5

### Patch Changes

- c86cb14: Add timing-safe comparison for WriteKey validation

  ### Security Improvements
  - Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
  - Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
  - Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks

## 6.0.1-preview.4

### Patch Changes

- 4cc79bb: Added compile-time schema validation with clear error messages
  - Added ValidateSchema type that validates Evolu schemas at compile-time and returns readable error messages instead of cryptic TypeScript errors
  - Schema validation now enforces:
    - All tables must have an 'id' column
    - The 'id' column must be a branded ID type (created with id() function)
    - Tables cannot use default column names (createdAt, updatedAt, isDeleted)
    - All column types must be compatible with SQLite (extend SqliteValue)
  - Enhanced developer experience with actionable error messages like "❌ Schema Error: Table 'todo' is missing required id column"
  - Added test coverage for all validation scenarios

## 6.0.1-preview.3

### Patch Changes

- 2a37317: Update dependencies
- 39cbd9b: Add ownerId into evolu_history table

## 6.0.1-preview.2

### Patch Changes

- 8ff21e5: GitHub release

## 6.0.1-preview.1

### Patch Changes

- de37bd1: Add ownerId to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.
  - Improved protocol documentation for versioning and error handling.
  - Improved E2E tests for protocol version negotiation.
  - Ensured all protocol errors (except for malformed data) are associated with the correct owner.

## 6.0.1-preview.0

### Patch Changes

- 632768f: Preview release

## 6.0.0

### Major Changes

- Major architectural overhaul:
  - Removed Effect dependency, introduced Evolu Library
  - New binary protocol with RBSR sync for efficient peer-to-peer synchronization
  - Message chunking and improved mutation API
  - Binary database change padding for enhanced privacy
  - Foundation for upcoming ephemeral messages, redacted deletion, and collaboration features
  - TODO: write more descriptive changelog.

## 5.4.0

### Minor Changes

- 19f7d85: Update peer dependencies @effect/platform, @effect/schema

## 5.3.0

### Minor Changes

- ab24e09: Experimental Websocket integration and realtime updates.

  It's only for Evolu Server for now.

### Patch Changes

- c63a2b8: @effect/platform 0.59

## 5.2.3

### Patch Changes

- 91298f3: @effect/platform 0.58

## 5.2.2

### Patch Changes

- 08758d8: @effect/schema 0.68

## 5.2.1

### Patch Changes

- 2183e61: Updated @effect/platform dependency

## 5.2.0

### Minor Changes

- e420fec: New API for working with Evolu instances

  The functions `resetOwner` and `restoreOwner` automatically reload the app to ensure no user data remains in memory. The new option `reload` allows us to opt out of this default behavior. For that reason, both functions return a promise that can be used to provide custom UX. There is also a new `reloadApp` function to reload the app in a platform-specific way (e.g., browsers will reload all tabs with Evolu instances).

  The `createEvolu` function has a new option, `mnemonic`. This option is useful for Evolu multitenancy when creating an Evolu instance with a predefined mnemonic. To create a mnemonic, use the new `createMnemonic` function.

## 5.1.4

### Patch Changes

- f1a8bcd: Update @effect/platform

## 5.1.3

### Patch Changes

- 8e519ca: Update peerDependencies

## 5.1.2

### Patch Changes

- 657262c: Update deps

## 5.1.1

### Patch Changes

- 5b6419a: Schema 0.67

## 5.1.0

### Minor Changes

- 79a6d0c: Time Travel

  Evolu does not delete data; it only marks them as deleted. This is because local-first is a distributed system. There is no central authority (if there is, it's not local-first). Imagine you delete data on some disconnected device and update it on another. Should we throw away changes? Such a deletion would require additional logic to enforce data deletion on all devices forever, even in the future, when some outdated device syncs. It's possible (and planned for Evolu), but it's not trivial because every device has to track data to be rejected without knowing the data itself (for security reasons).

  Not deleting data allows Evolu to provide a time-traveling feature. All data, even "deleted" or overridden, are stored in the evolu_message table. Here is how we can read such data.

  ```ts
  const todoTitleHistory = (id: TodoId) =>
    evolu.createQuery((db) =>
      db
        .selectFrom("evolu_message")
        .select("value")
        .where("table", "==", "todo")
        .where("row", "==", id)
        .where("column", "==", "title")
        .$narrowType<{ value: TodoTable["title"] }>()
        .orderBy("timestamp", "desc"),
    );
  ```

  Note that this API is not 100% typed, but it's not an issue because Evolu Schema shall be append-only. Once an app is released, we shall not change Schema names and types. We can only add new tables and columns because there is a chance current Schema is already used.

## 5.0.3

### Patch Changes

- e8f293f: Add exportDatabase

## 5.0.2

### Patch Changes

- 2b0b8bf: Fix bug

  It was a silly typo; sorry about that. Ironically, tests didn't catch it because that was the one test I didn't port after refactoring. My bad. We will add more tests in the future.

## 5.0.1

### Patch Changes

- af02cf8: Effect is stable, but the platform and schema aren't yet

## 5.0.0

### Major Changes

- d156e67: Multitenancy, stable Effect, refactoring, logging

  Greetings. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains unchanged, but Evolu uses the Effect library better. When Evolu started with Effect, the website didn't exist yet.

  The initial reason for refactoring Evolu was that I wasn't satisfied with the Web Workers wrapper. I tried Comlink. It's a great library, but it has flaws, as documented in a new ProxyWorker, a lightweight Comlink tailored for Effect. While Effect provides an excellent wrapper for workers, I wanted to try a Comlink-like API. Such a change was a chance to review how Evolu uses Effect, and I realized I used too many Layers for no reason.

  During refactoring, I realized it would be nice if Evolu could run more instances concurrently. So, Evolu now supports multitenancy 🙂.

  I wasn't satisfied with the initial data definition, so I added an API for that, too. And logging. If you are curious about what's happening within Evolu, try the new `minimumLogLevel` Config option. There are also a few minor improvements inside the core logic. Again, there are no breaking changes; it is just better and more readable source code.

  The great news is that Effect is stable now, so there will be no more releases with deps updates. Let's dance 🪩

  New features:
  - Multitenancy (we can run more Evolu instances side by side)
  - Initial data (to define fixtures)
  - Logging (you can see what's happening inside Evolu step by step)
  - Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
  - Stable Effect 🎉

- 30d2a40: `createIndex` replaced with `createIndexes`

  That's why it's a breaking change—a slight change in API. Everything else is backward compatible. Evolu is stable for many major versions.

### Minor Changes

- 69bcf80: Update the minimal TypeScript version to 5.4

## 4.1.1

### Patch Changes

- a0d1e3c: Add config logSql option
- 0afb614: Update Effect and Schema

## 4.1.0

### Minor Changes

- 8af071c: Indexes (or indices, we don't judge)

  This release brings SQLite indexes support to Evolu with two helpful options for `evolu.createQuery` functions.

  ```ts
  const indexes = [
    createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
  ];

  const evolu = createEvolu(Database, {
    // Try to remove/re-add indexes with `logExplainQueryPlan`.
    indexes,
  });

  const allTodos = evolu.createQuery(
    (db) => db.selectFrom("todo").orderBy("createdAt").selectAll(),
    {
      logExecutionTime: true,
      // logExplainQueryPlan: false,
    },
  );
  ```

  Indexes are not necessary for development but are recommended for production.

  Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
  createQuery options.

  SQLite has [a tool](https://sqlite.org/cli.html#index_recommendations_sqlite_expert_) for index recommendations.

## 4.0.5

### Patch Changes

- 6e61bb9: Update Effect and Schema

  Rename `Schema.To` to `Schema.Type`.

  All Effect Schema changes are [here](https://github.com/Effect-TS/effect/blob/main/packages/schema/WHATSNEW-0.64.md).

## 4.0.4

### Patch Changes

- 9f92715: Effect 2.4.3, Schema 0.63.4

## 4.0.3

### Patch Changes

- d5038ba: Update Kysely for TypeScript 5.4

## 4.0.2

### Patch Changes

- 1f9168f: Fix SSR

  Evolu server-side rendering was surprisingly problematic because of the React Suspense error: "This Suspense boundary received an update before it finished hydrating."

  If you are curious why a local-first library needs to render something on the server where there is no data, the answer is that if we can render empty rows, we should.

  But because of the React Suspense error, Evolu apps had to be wrapped by the ClientOnly component, which wasn't ideal. Check article:

  https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store

  Internally, PlatformName has been replaced with useWasSSR React Hook.

## 4.0.1

### Patch Changes

- aa06cbe: Allow using Kysely `with` and `withRecursive`

  And throw on forbidden SQL mutations.

## 4.0.0

### Major Changes

- 2fe4e16: Add Config name property and remove LocalStorage support.

  It's a breaking change only because PlatformName was restricted. There is no change in sync protocol so that all data can be safely restored.

### Patch Changes

- 01d2554: Update peer dependencies

## 3.1.8

### Patch Changes

- 01d2554: Update peer deps

## 3.1.7

### Patch Changes

- 888b83e: Add platformName property to Evolu.

## 3.1.6

### Patch Changes

- ccd699a: Fix #333

## 3.1.5

### Patch Changes

- f6e198a: Effect 2.40.0, Schema 0.63.0

## 3.1.4

### Patch Changes

- 1cf6502: Update Effect and Schema

## 3.1.3

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

## 3.1.2

### Patch Changes

- a59be92: Update Effect and Schema

## 3.1.1

### Patch Changes

- b337e70: Update Effect and Schema

## 3.1.0

### Minor Changes

- ef32952: Add createOrUpdate

  This function is useful when we already have an `id` and want to create a
  new row or update an existing one.

  ```ts
  import * as S from "effect/Schema";
  import { Id } from "@evolu/react";

  // Id can be stable.
  // 2024-02-0800000000000
  const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;

  evolu.createOrUpdate("todo", { id, title });
  ```

## 3.0.15

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3

## 3.0.14

### Patch Changes

- f1d76d3: Effect 2.2.2 and Schema 0.61.2

  Schema parse renamed to decodeUnknown.

## 3.0.13

### Patch Changes

- 369ff8b: Update peer deps

## 3.0.12

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6

## 3.0.11

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3

## 3.0.10

### Patch Changes

- 3cd5c71: Update deps

## 3.0.9

### Patch Changes

- ff6254b: Update Effect and Schema peer dependencies

  Effect 2 isn't still considered stable; breaking changes can happen in minor versions. Effect 3 will be stable. No worries, they are only tuning APIs.

## 3.0.8

### Patch Changes

- 047b92e: Update Kysely to 0.27.0

  Check [Kysely release](https://github.com/kysely-org/kysely/releases/tag/0.27.0)

  Note simplified `$narrowType` usage. Previous:

  ```ts
  .$narrowType<{ title: NonEmptyString1000 }>()
  ```

  Simplified:

  ```ts
  .$narrowType<{ title: NotNull }>()
  ```

## 3.0.7

### Patch Changes

- a2068f2: Use namespace imports

  Namespace imports make dev faster and build smaller for bundlers without three shaking.

  https://www.effect.website/docs/essentials/importing

## 3.0.6

### Patch Changes

- 1b4e331: Update Effect and Schema peer dependencies

  If you are curious why Effect and Schema peer dependencies must be updated on every release, the reason is that Effect isn't version 2 yet. Hence, it must be pinned to the same version.

## 3.0.5

### Patch Changes

- ac609e1: Update Schema peer dependency

## 3.0.4

### Patch Changes

- e6abac0: Update Effect and Schema deps

## 3.0.3

### Patch Changes

- ebbe716: Export QueryResult type

## 3.0.2

### Patch Changes

- 16d7d5b: Update deps

## 3.0.1

### Patch Changes

- a969843: Add ExtractRow type helper

  Extract `Row` from `Query` instance.

  ```ts
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  type AllTodosRow = ExtractRow<typeof allTodos>;
  ```

## 3.0.0

### Major Changes

- d289ac7: Improve table and database schema DX.

  In the previous Evolu version, table and database schemas were created with `S.struct` and validated with createEvolu. Because of how the TypeScript compiler works, type errors were incomprehensible.

  We added two new helper functions to improve a DX: `table` and `database`.

  Previous schema definition:

  ```ts
  const TodoTable = S.struct({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = S.struct({
    todo: TodoTable,
  });
  ```

  New schema definition:

  ```ts
  const TodoTable = table({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = database({
    todo: TodoTable,
  });
  ```

  Those two helpers also detect missing ID columns and the usage of reserved columns.

  This update is a breaking change because reserved columns (createdAt, updatedAt, isDeleted) are created with `table` function now.

## 2.2.4

### Patch Changes

- eb819cb: Rename Schema to DatabaseSchema
- 92448d6: Update peer deps

## 2.2.3

### Patch Changes

- 215662c: Update deps

## 2.2.2

### Patch Changes

- 33974aa: Fix number protobuf serialization

## 2.2.1

### Patch Changes

- 98e19f0: Update deps

## 2.2.0

### Minor Changes

- bc18e74: Add the sync function

  Evolu syncs on every mutation, tab focus, and network reconnect, so it's generally not required to sync manually, but if you need it, you can do it.

  ```ts
  evolu.sync();
  ```

## 2.1.0

### Minor Changes

- 1eef638: Add makeCreateEvolu factory

## 2.0.6

### Patch Changes

- b00dec2: Update deps

## 2.0.5

### Patch Changes

- b06757c: Update readme

## 2.0.4

### Patch Changes

- 4563ec0: Bump peer dependants

## 2.0.3

### Patch Changes

- 59ec99c: Update @evolu/common peer dependencies

## 2.0.2

### Patch Changes

- ddd4014: Update readme

## 2.0.1

### Patch Changes

- fea7623: Fix SSR

## 2.0.0

### Major Changes

- 7e80483: New API

  With the upcoming React 19 `use` Hook, I took a chance to review and improve the Evolu API. I moved as many logic and types as possible to the Evolu interface to make platform variants more lightweight and to allow the use of Evolu directly out of any UI library.

  The most significant change is the split of SQL query declaration and usage. The rest of the API is almost identical except for minor improvements and one removal: filterMap helper is gone.

  It was a good idea with a nice DX, but such ad-hoc migrations belong in the database, not the JavaScript code. Filtering already loaded data pulls excessive data that should stay in the database. The good news is we can do that and even better with Kysely.

  To refresh what we are talking about for Evolu newcomers. Because database schema is evolving, and we can't do classical migrations in local-first apps (because we don't delete and other CRDT stuff), Evolu adopted GraphQL schema-less everything-is-nullable pattern.

  Having nullable everywhere in code is not ideal DX, so it would be nice to filter, ensure non-nullability, and even map rows directly in the database. Surprisingly, SQL is capable of that. Expect Evolu DSL for that soon. Meanwhile, we can do that manually:

  ```ts
  const todosWithout = evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", Evolu.cast(true))
      // Filter null value and ensure non-null type. Evolu will provide a helper.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
      .orderBy("createdAt"),
  );
  ```

  And now to the new API. Behold:

  ```ts
  // Create queries.
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  const todoById = (id: TodoId) =>
    evolu.createQuery((db) =>
      db.selectFrom("todo").selectAll().where("id", "=", id),
    );

  // We can load a query or many queries.
  const allTodosPromise = evolu.loadQuery(allTodos).then(({ rows }) => {
    console.log(rows);
  });
  evolu.loadQueries([allTodos, todoById(1)]);

  // useQuery can load once or use a promise.
  const { rows } = useQuery(allTodos);
  const { rows } = useQuery(allTodos, { once: true });
  const { rows } = useQuery(allTodos, { promise: allTodosPromise });
  const { row } = useQuery(todoById(1));
  ```

  I also refactored (read: simplified) the usage of Effect Layers across all libraries. And the last thing: There is no breaking change in data storage or protocol.

## 1.0.17

### Patch Changes

- 22f6085: Update deps

## 1.0.16

### Patch Changes

- 08839c9: Update deps

## 1.0.15

### Patch Changes

- db84a4e: Update deps
- 51ead17: Make useQuery filterMap optional and reusable

## 1.0.14

### Patch Changes

- 242d7e5: Experimental new feature: Local only tables

  A local-only table is a table prefixed with "\_" that will never be synced—a small but handy addition. Imagine editing huge JSON. Should we store it on any change or allow the user to "commit" data later? In an ideal world, we would have CRDT abstraction for any data, and we will have, but for now, we can postpone or even cancel sync with local-only tables. Another use-case is device-only data, for example, some settings that should not be shared with other devices. Local-only tables also allow real deletion. Use the isDeleted common column and the row will be deleted instead of marked as deleted.

## 1.0.13

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom

## 1.0.12

### Patch Changes

- 094e25a: Expose and leverage canUseDOM

## 1.0.11

### Patch Changes

- 8f7c8c8: Dedupe messages created within the microtask queue

  That's only for a case where someone accidentally calls mutate with the same values repeatedly. There is no reason to create identical messages.

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

## 1.0.9

### Patch Changes

- ad267b4: Update deps

## 1.0.8

### Patch Changes

- 3f89e12: Update deps

## 1.0.7

### Patch Changes

- a938b3d: Update deps

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies

## 1.0.5

### Patch Changes

- 0b53b45: Update deps

## 1.0.4

### Patch Changes

- ac05ef2: Update deps

## 1.0.3

### Patch Changes

- c406a60: Update deps

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency

## 1.0.1

### Patch Changes

- 21f41b0: Update deps

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries
