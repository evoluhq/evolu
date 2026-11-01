# @evolu/relay

## 4.3.0

### Minor Changes

- b352b38: Sent an empty text frame with each relay ping, so clients notice connections that die without closing

  The WebSocket API answers pings without telling JavaScript, in browsers, React Native and Node alike, so a client could not tell a connection that died silently from an idle one. The relay now sends an empty text frame as each connection's first frame and right after each ping, which clients from `@evolu/common` 8.26.0 watch; older clients ignore it. A proxy in front of the relay must allow more than thirty seconds of idle time, as it already had to for the pings.

  `pingInterval` of `createRelay` must now be at most thirty seconds, `relayHeartbeatInterval`, and a longer one panics before the relay opens its database.

### Patch Changes

- Updated dependencies [b352b38]
- Updated dependencies [b352b38]
- Updated dependencies [f4ed930]
- Updated dependencies [d6838fb]
  - @evolu/nodejs@4.6.0
  - @evolu/common@8.26.0

## 4.2.22

### Patch Changes

- 1e73148: Fixed relays storing a new owner's write key before its quota check

  A relay stored the write key of an owner it hadn't seen with any request that carried one, including a sync request without changes, before it asked `isOwnerWithinQuota`. On a relay that admits anyone, requests with made-up OwnerIds added rows that no quota limited. On a relay whose quota refuses unknown owners, someone who knew an OwnerId could claim it, and the relay then refused the owner's own writes until its operator deleted the owner. A relay now stores an owner's write key only with the first write for the owner that passes the quota check, so a quota that refuses an OwnerId also keeps others from claiming it. Once the quota admits it, whoever writes first still can, as [Privacy](https://www.evolu.dev/docs/privacy#write-keys) describes.

  Write keys that earlier releases stored stay. With the relay stopped, `delete from evolu_writeKey where ownerId not in (select ownerId from evolu_message);` deletes the ones stored without data, which an owner's next accepted write stores again, and `relay.deleteOwner` removes a squatter that stored data.

  For custom relay storage: `Storage` no longer has `validateWriteKey`. `RelayStorage`, which `applyProtocolMessageAsRelay` now takes, has it, and it only compares keys, because the relay calls it only for a request without messages. Its `writeMessages` takes the writer's write key before the messages, so an implementation written for `Storage` no longer compiles. It must compare the key with the owner's under the owner's lock, return `StorageWriteKeyError` for another, and store a new owner's key in the write's transaction, as `createRelaySqliteStorage` does.

  ```ts
  import {
    assertType,
    ok,
    type NonEmptyReadonlyArray,
    type Task,
  } from "@evolu/common";
  import type {
    EncryptedCrdtMessage,
    OwnerIdBytes,
    OwnerWriteKey,
    RelayStorage,
    RelayStorageWriteMessagesError,
    Storage,
    StorageWriteMessagesError,
  } from "@evolu/common/local-first";

  // A client's Storage no longer has validateWriteKey; RelayStorage has it.
  assertType<"validateWriteKey" extends keyof Storage ? true : false, false>();

  const writeMessagesWithoutWriteKey =
    (
      _ownerIdBytes: OwnerIdBytes,
      _messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
    ): Task<void, StorageWriteMessagesError> =>
    () =>
      ok();

  // @ts-expect-error RelayStorage's writeMessages takes the write key before the messages.
  const _before: RelayStorage["writeMessages"] = writeMessagesWithoutWriteKey;

  const _after: RelayStorage["writeMessages"] =
    (_ownerIdBytes, _writeKey, _messages) => () =>
      ok();

  assertType<Parameters<RelayStorage["writeMessages"]>[1], OwnerWriteKey>();
  assertType<
    ReturnType<RelayStorage["writeMessages"]>,
    Task<void, RelayStorageWriteMessagesError>
  >();
  ```

- Updated dependencies [f4e7be7]
- Updated dependencies [d2cbfd4]
- Updated dependencies [952cee0]
- Updated dependencies [b2e5000]
- Updated dependencies [9b66810]
- Updated dependencies [7a7e311]
- Updated dependencies [ef25d85]
- Updated dependencies [ff5cc09]
- Updated dependencies [f50d979]
- Updated dependencies [b2e5000]
- Updated dependencies [ed0da2a]
- Updated dependencies [1e73148]
  - @evolu/common@8.25.0
  - @evolu/nodejs@4.5.0

## 4.2.21

### Patch Changes

- Updated dependencies [d9cfd60]
  - @evolu/nodejs@4.4.3

## 4.2.20

### Patch Changes

- Updated dependencies [8c8e86c]
- Updated dependencies [8c8e86c]
  - @evolu/nodejs@4.4.2
  - @evolu/common@8.24.1

## 4.2.19

### Patch Changes

- 4f6a40d: Logged requests the relay can't decode only at debug level

  A client that sent malformed frames in a loop could fill the relay's disk with
  logs: each one logged `invalid protocol request` with its decoding error's stack
  at the default level, about 2 KB per frame, while the relay kept the connection
  open. A malformed request is the client's failure, so the relay now logs it at
  `debug`, which `EVOLU_RELAY_LOG_LEVEL=debug` shows.

- Updated dependencies [4f6a40d]
  - @evolu/nodejs@4.4.1

## 4.2.18

### Patch Changes

- 057ead0: Moved the relay onto Evolu's own SQLite

  The relay now runs SQLite 3.54.1 in Evolu's own build, the one
  `@evolu/nodejs` ships prebuilt, instead of better-sqlite3. Its database stays
  `data/evolu-relay.db`, unencrypted as before: the changes it stores are
  already encrypted end-to-end, and the relay needs the rest, such as OwnerIds,
  timestamps and write keys, to sync. A database an earlier relay wrote opens as
  it is. As before, installing the relay runs no install script and builds
  nothing; the Docker image now gets `@evolu/nodejs`'s addon for musl. The npm package doesn't run on Windows yet. A
  database file that's a symbolic link no longer opens, where better-sqlite3
  followed it: link or mount its directory, `data`, instead.

- Updated dependencies [1c89914]
- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [72177aa]
- Updated dependencies [1c89914]
- Updated dependencies [5c97752]
- Updated dependencies [057ead0]
- Updated dependencies [be5afcb]
- Updated dependencies [fd3565e]
- Updated dependencies [f3a8831]
- Updated dependencies [f43e20e]
  - @evolu/common@8.24.0
  - @evolu/nodejs@4.4.0

## 4.2.17

### Patch Changes

- Updated dependencies [644fe0e]
- Updated dependencies [7f13706]
- Updated dependencies [c63a5a6]
- Updated dependencies [d3a6119]
- Updated dependencies [8ce5f69]
- Updated dependencies [a5da2ab]
  - @evolu/common@8.23.2
  - @evolu/nodejs@4.3.4

## 4.2.16

### Patch Changes

- Updated dependencies [ab8af16]
  - @evolu/common@8.23.1
  - @evolu/nodejs@4.3.4

## 4.2.15

### Patch Changes

- 5402ec8: Pinned the Docker image's Node.js base image by digest

  The `evoluhq/relay` image was built from whatever `node:24-alpine` pointed to
  at build time. It is now built from `node:24.22.0-alpine` pinned by digest, so
  a re-pointed tag can't change it, and newer Node.js 24 releases reach the image
  with relay releases. npm installs the relay into the image without running
  install scripts, which no package in its dependency tree needs.

  The `NODE_VERSION` build argument was removed. To build the image on another
  Node.js version, change the `FROM` line in `apps/relay/Dockerfile`.

- Updated dependencies [5402ec8]
- Updated dependencies [5402ec8]
  - @evolu/common@8.23.0
  - @evolu/nodejs@4.3.4

## 4.2.14

### Patch Changes

- Updated dependencies [588456f]
  - @evolu/common@8.22.4
  - @evolu/nodejs@4.3.3

## 4.2.13

### Patch Changes

- Updated dependencies [b57803e]
- Updated dependencies [06a86d9]
  - @evolu/common@8.22.3
  - @evolu/nodejs@4.3.3

## 4.2.12

### Patch Changes

- Updated dependencies [d10893a]
- Updated dependencies [2deb7d8]
  - @evolu/common@8.22.2
  - @evolu/nodejs@4.3.2

## 4.2.11

### Patch Changes

- Updated dependencies [c791716]
- Updated dependencies [a9d2ff0]
  - @evolu/nodejs@4.3.2

## 4.2.10

### Patch Changes

- Updated dependencies [2c20a45]
- Updated dependencies [8aa6676]
  - @evolu/common@8.22.1
  - @evolu/nodejs@4.3.1

## 4.2.9

### Patch Changes

- Updated dependencies [76480a8]
  - @evolu/common@8.22.0
  - @evolu/nodejs@4.3.1

## 4.2.8

### Patch Changes

- 4493e77: Stopped sync from reading timestamps it does not use

  To answer a Timestamps range, sync reads the owner's timestamps in order until
  its frame is full, but storage read every timestamp of the range up front. So
  every round of an initial download read the rest of the owner again, and a relay
  answering a device with nothing stored spent time and memory that grew with the
  owner, about 700 ms for 900,000 changes. Storage now streams the timestamps and
  stops at the last one sync uses. That answer takes about 40 ms at any owner
  size, and syncing 20,000 changes reads about 40,000 rows instead of 138,000 on
  the relay when downloading, and instead of 121,000 on the client when uploading.

  `Sqlite` and `SqliteDriver` gained `iterate`, which passes a query's rows to a
  callback one at a time until it returns `false`. The callback can read the
  database but must not write it. Update `@evolu/web`, `@evolu/react-native` and
  `@evolu/nodejs` together with `@evolu/common`, because sync fails with an older
  driver. A custom `SqliteDriver` must implement `iterate` on a statement of its
  own, because the callback can run queries:

  ```ts
  import {
    assertEqual,
    constVoid,
    sql,
    type SqliteDriver,
    type SqliteRow,
  } from "@evolu/common";

  const rows: ReadonlyArray<SqliteRow> = [{ a: 1 }, { a: 2 }, { a: 3 }];

  // @ts-expect-error A SqliteDriver must implement iterate.
  const _driverBefore: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  const driver: SqliteDriver = {
    exec: () => ({ rows, changes: 0 }),
    iterate: (_query, onRow) => {
      for (const row of rows) if (!onRow(row)) break;
    },
    export: () => new Uint8Array(),
    deleteDatabase: constVoid,
    [Symbol.dispose]: constVoid,
  };

  const passed: Array<SqliteRow> = [];
  driver.iterate(sql`select a from t;`, (row) => {
    passed.push(row);
    return passed.length < 2;
  });
  assertEqual(passed, [{ a: 1 }, { a: 2 }]);
  ```

- 4aa2c7a: Kept one connection from blocking the relay

  The relay handled each WebSocket message as soon as it arrived. A burst of cheap
  requests on one connection blocked every other connection for seconds, one
  request of many cheap ranges, such as empty Timestamps ranges, took about a
  second, and a client that did not read its replies made the relay queue them
  without limit.

  The relay now serves each connection's requests one at a time and serves other
  connections in between. It does not read a connection while its requests wait,
  and it serves the next one only after the previous reply is written, so a client
  that sends faster than it reads is slowed down instead of growing the relay's
  memory. A request waiting for an asynchronous `isOwnerWithinQuota` holds the
  later requests of its connection, so the callback should settle quickly.

  One sync answer makes a bounded number of storage reads. Past that limit its
  frame closes and the rest syncs in the next round, so one request holds the
  relay for at most about half a second, even for an owner of hundreds of
  thousands of changes. Limit connections per IP address in a reverse proxy in
  front of the relay.

- Updated dependencies [4493e77]
- Updated dependencies [4aa2c7a]
  - @evolu/common@8.21.0
  - @evolu/nodejs@4.3.1

## 4.2.7

### Patch Changes

- Updated dependencies [e7c0b5a]
- Updated dependencies [2d00a74]
  - @evolu/common@8.20.3
  - @evolu/nodejs@4.3.0

## 4.2.6

### Patch Changes

- Updated dependencies [81155b1]
  - @evolu/common@8.20.2
  - @evolu/nodejs@4.3.0

## 4.2.5

### Patch Changes

- Updated dependencies [bfba9bf]
- Updated dependencies [609d399]
- Updated dependencies [8e58bcb]
- Updated dependencies [8e58bcb]
  - @evolu/common@8.20.1
  - @evolu/nodejs@4.3.0

## 4.2.4

### Patch Changes

- Updated dependencies [e803b34]
- Updated dependencies [88840c2]
- Updated dependencies [87f0678]
- Updated dependencies [848ea9c]
- Updated dependencies [ea707cc]
- Updated dependencies [74cc737]
- Updated dependencies [fbdb9a4]
- Updated dependencies [e803b34]
- Updated dependencies [b599e0d]
- Updated dependencies [c3fa5c7]
- Updated dependencies [c3fa5c7]
- Updated dependencies [74cc737]
  - @evolu/common@8.20.0
  - @evolu/nodejs@4.2.1

## 4.2.3

### Patch Changes

- Updated dependencies [ce3b88b]
  - @evolu/common@8.19.0
  - @evolu/nodejs@4.2.0

## 4.2.2

### Patch Changes

- 215bf32: Fixed relay crashes and failing syncs with `@evolu/common` 8.18.0

  Update relays to this version. With it, the relay:

  - Keeps running when SQLite fails to store a write, such as on a full disk, and
    answers with `ProtocolWriteError`. Before, the failure crashed the relay, and
    a supervisor restarting it crashed again on the next write.
  - Answers syncs whose reply nearly fills a message. Before, such a reply failed
    the same way on every retry, so the owner stopped syncing through the relay.
  - Skips a stored change too large for any message, and logs it with
    `console.warn`, instead of asking for it in every round without end.
  - Rejects malformed requests before storing, subscribing, or broadcasting
    anything, such as changes shorter than any encrypted change, which its quota
    did not count.
  - Looks up each incoming timestamp by primary key, so writes no longer slow down
    as an owner's changes grow.

  See the `@evolu/common` 8.18.0 release notes for details.

- Updated dependencies [3d51568]
- Updated dependencies [969667e]
- Updated dependencies [7d804cd]
- Updated dependencies [8ad3dec]
- Updated dependencies [6878627]
- Updated dependencies [3d51568]
- Updated dependencies [25b2140]
- Updated dependencies [e2d22a3]
- Updated dependencies [7d804cd]
- Updated dependencies [6878627]
- Updated dependencies [7d804cd]
- Updated dependencies [6878627]
- Updated dependencies [739817f]
- Updated dependencies [6878627]
- Updated dependencies [6878627]
  - @evolu/common@8.18.0
  - @evolu/nodejs@4.2.0

## 4.2.1

### Patch Changes

- Updated dependencies [9cbd733]
  - @evolu/common@8.17.0
  - @evolu/nodejs@4.2.0

## 4.2.0

### Minor Changes

- 9081fc0: Added EVOLU_RELAY_LOG_LEVEL to set the relay's log level

  The relay reads its console level from `EVOLU_RELAY_LOG_LEVEL`: `trace`,
  `debug`, `log`, `info`, `warn`, `error`, or `silent`, defaulting to `log`.
  Before, connection events were logged only at `debug`, which could not be
  enabled without rebuilding the image. `debug` logs each connection, and `trace`
  also every SQL query. An unknown level stops the relay with a validation error,
  like other invalid `EVOLU_RELAY_*` variables.

### Patch Changes

- 20e329e: Added a health endpoint to the relay

  `createRelay` now answers `GET` and `HEAD` requests for `/health` with status
  200 and `{"status":"ok"}` while its database file can be read, and with status
  503 and `{"status":"error"}` otherwise, so uptime monitors and load balancers
  can check a relay. Other plain HTTP requests get status 426 instead of no
  response at all. The relay's Docker image now checks `/health` instead of only
  opening a TCP connection, so a relay that cannot read its database file is
  reported unhealthy.

- Updated dependencies [a09e87b]
- Updated dependencies [20e329e]
- Updated dependencies [90b0c0b]
- Updated dependencies [a09e87b]
- Updated dependencies [f7e9439]
- Updated dependencies [a09e87b]
- Updated dependencies [1137d52]
- Updated dependencies [2b2c7fb]
- Updated dependencies [90b0c0b]
- Updated dependencies [eb06ba1]
- Updated dependencies [1137d52]
- Updated dependencies [0e95535]
  - @evolu/common@8.16.0
  - @evolu/nodejs@4.2.0

## 4.1.5

### Patch Changes

- Updated dependencies [22900a8]
  - @evolu/common@8.15.1
  - @evolu/nodejs@4.1.1

## 4.1.4

### Patch Changes

- Updated dependencies [fb4c82f]
- Updated dependencies [9dbf790]
- Updated dependencies [93f2a30]
- Updated dependencies [d1e22b4]
- Updated dependencies [bc56001]
- Updated dependencies [d1e22b4]
- Updated dependencies [4d7e66b]
  - @evolu/common@8.15.0
  - @evolu/nodejs@4.1.1

## 4.1.3

### Patch Changes

- Updated dependencies [6710da3]
  - @evolu/common@8.14.0
  - @evolu/nodejs@4.1.0

## 4.1.2

### Patch Changes

- Updated dependencies [9e5a033]
- Updated dependencies [428350e]
- Updated dependencies [428350e]
- Updated dependencies [6257650]
- Updated dependencies [eeaa3c5]
- Updated dependencies [6257650]
- Updated dependencies [428350e]
- Updated dependencies [3a83a48]
- Updated dependencies [36f9f81]
  - @evolu/common@8.13.0
  - @evolu/nodejs@4.1.0

## 4.1.1

### Patch Changes

- Updated dependencies [66ee0c8]
- Updated dependencies [29e1187]
- Updated dependencies [58182e2]
- Updated dependencies [58182e2]
  - @evolu/common@8.12.0
  - @evolu/nodejs@4.1.0

## 4.1.0

### Minor Changes

- 950d79b: Added WebSocket pings to the relay

  The relay pings every connection at `pingInterval`, thirty seconds by default,
  and terminates a connection from which nothing has arrived since the previous
  ping, so an idle dead path is detected within two intervals and NAT mappings
  stay alive. Any incoming data counts, so an upload that delays a client's answer
  on a slow link keeps its connection. A connection with data still queued in the
  relay for it, such as a large reply on a slow link, is not pinged or terminated
  until the operating system takes that data, because the answer waits behind it;
  TCP ends such a connection if its path is dead. Data the operating system
  already holds can still delay the answer past an interval, and the connection
  then reconnects once after that data arrives. A connection is terminated instead
  of queuing a broadcast that would leave more than 16 MB of broadcasts unsent to
  it, whether its client stopped reading or reads more slowly than its owners'
  traffic arrives, which bounds the relay's memory for it; the client reconciles
  after it reconnects. Replies to a client's own requests do not count, because
  their total follows its requests. Browsers answer pings automatically, so
  clients need no change.

  ```ts
  import { assertEqual } from "@evolu/common";
  import type { NodeJsRelayConfig } from "@evolu/nodejs";

  // Detects a dead connection within about twenty seconds instead of a minute.
  const config: Pick<NodeJsRelayConfig, "pingInterval"> = {
    pingInterval: "10s",
  };
  assertEqual(config, { pingInterval: "10s" });
  ```

### Patch Changes

- 78d0052: Fixed relay crashes on rejected frames and during shutdown

  A client that sent a frame the relay rejects, such as one larger than the
  maximum protocol message size, crashed the relay process and disconnected every
  client. The relay now closes only that connection and logs the error at debug
  level.

  A frame, or a connection attempt to a relay configured with `isOwnerAllowed`,
  that arrived while the relay was shutting down, such as from a client syncing
  during a deploy, crashed the process before shutdown finished. The relay now
  ignores frames and refuses connections once shutdown starts.

- Updated dependencies [950d79b]
- Updated dependencies [f0101ca]
- Updated dependencies [fdac39e]
- Updated dependencies [ecbac00]
- Updated dependencies [b506c9b]
- Updated dependencies [fdac39e]
- Updated dependencies [d2973b9]
- Updated dependencies [b75abfa]
- Updated dependencies [69b756c]
- Updated dependencies [5a671b2]
- Updated dependencies [e270e42]
- Updated dependencies [ef320ff]
- Updated dependencies [5a671b2]
- Updated dependencies [09b1b5c]
- Updated dependencies [fdac39e]
- Updated dependencies [0770038]
- Updated dependencies [e270e42]
- Updated dependencies [f52d66b]
- Updated dependencies [d2973b9]
- Updated dependencies [fdac39e]
- Updated dependencies [11ccc28]
- Updated dependencies [2e139eb]
- Updated dependencies [0624d35]
- Updated dependencies [ecd1c0d]
- Updated dependencies [568358b]
- Updated dependencies [2d2d162]
- Updated dependencies [237fd7f]
- Updated dependencies [e7d27be]
- Updated dependencies [2e139eb]
- Updated dependencies [daf6295]
- Updated dependencies [d2973b9]
- Updated dependencies [ba8c493]
- Updated dependencies [78d0052]
- Updated dependencies [8e23edb]
- Updated dependencies [fdac39e]
- Updated dependencies [d54eff8]
- Updated dependencies [cf68cee]
  - @evolu/nodejs@4.1.0
  - @evolu/common@8.11.0

## 4.0.0

### Major Changes

- 6269b91: Published the configurable relay package

  The relay was a private workspace app that only shipped as a Docker image. It
  is now published to npm with the `evolu-relay` executable, so it can run with
  `npx @evolu/relay`. The `evoluhq/relay` Docker image installs the published
  package and is built as part of every release that publishes a new relay
  version.

  The relay reads its port from `PORT` and its per-owner storage quota
  from `EVOLU_RELAY_MAX_OWNER_BYTES`, as a size literal such as `10MiB`.
  Bare byte counts such as `1048576` are not accepted; use `1MiB` instead.
  `PORT` supports hosting platforms that supply the listening port. There is no
  `EVOLU_RELAY_PORT` override. The port still defaults to 4000. Leaving the quota
  unset imposes no per-owner storage limit; `0B` permits no stored bytes.
  Invalid supplied values never fall back to defaults or disable the quota.

  Ports must be integers from 0 through 65535; zero requests an automatically
  assigned listening port. An empty, invalid, or unknown `EVOLU_RELAY_*`
  variable stops the relay with a formatted validation error, before creating
  the data directory or initializing its database. Startup reports the first
  validation message and preserves all collected errors in the Error's `cause`.
  The Docker health check uses the configured `PORT`; use a fixed, nonzero port
  when running the image.

  Environment names must exactly match the declared CONSTANT_CASE names. Incorrect
  casing within the `EVOLU_RELAY_` namespace is reported as an unknown variable.
  Casing is not repaired, and double underscores do not introduce nested settings.

### Patch Changes

- Updated dependencies [532feaa]
- Updated dependencies [6bd0a36]
- Updated dependencies [f4d9ad7]
- Updated dependencies [3d84543]
- Updated dependencies [6bd0a36]
- Updated dependencies [76554bd]
- Updated dependencies [2183ca3]
- Updated dependencies [918d77b]
- Updated dependencies [f4d9ad7]
- Updated dependencies [9fc736f]
- Updated dependencies [918d77b]
- Updated dependencies [6bd0a36]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [91ff875]
- Updated dependencies [ad85bdb]
- Updated dependencies [8ac49c8]
- Updated dependencies [6bd0a36]
- Updated dependencies [140c4cf]
- Updated dependencies [3d84543]
- Updated dependencies [3d84543]
- Updated dependencies [f3b5829]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [9ee6f15]
  - @evolu/common@8.10.0
  - @evolu/nodejs@4.0.0

## 3.0.14

### Patch Changes

- Updated dependencies [24ee6b0]
  - @evolu/common@8.9.0
  - @evolu/nodejs@3.2.0

## 3.0.13

### Patch Changes

- Updated dependencies [a6335c5]
- Updated dependencies [037c390]
- Updated dependencies [91ff2c9]
- Updated dependencies [468b824]
- Updated dependencies [468b824]
- Updated dependencies [57217a0]
- Updated dependencies [468b824]
- Updated dependencies [0be94d0]
  - @evolu/nodejs@3.2.0
  - @evolu/common@8.8.0

## 3.0.12

### Patch Changes

- Updated dependencies [f9257a7]
  - @evolu/common@8.7.0
  - @evolu/nodejs@3.1.0

## 3.0.11

### Patch Changes

- Updated dependencies [c9b0c0d]
  - @evolu/common@8.6.2
  - @evolu/nodejs@3.1.0

## 3.0.10

### Patch Changes

- Updated dependencies [9e71ebd]
  - @evolu/common@8.6.1
  - @evolu/nodejs@3.1.0

## 3.0.9

### Patch Changes

- Updated dependencies [076dc42]
- Updated dependencies [420b03e]
- Updated dependencies [54c289e]
- Updated dependencies [420b03e]
- Updated dependencies [420b03e]
- Updated dependencies [420b03e]
- Updated dependencies [420b03e]
- Updated dependencies [076dc42]
- Updated dependencies [420b03e]
  - @evolu/common@8.6.0
  - @evolu/nodejs@3.1.0

## 3.0.8

### Patch Changes

- Updated dependencies [7037216]
- Updated dependencies [d52ccce]
  - @evolu/common@8.5.0
  - @evolu/nodejs@3.0.1

## 3.0.7

### Patch Changes

- Updated dependencies [b973c4e]
- Updated dependencies [b973c4e]
  - @evolu/common@8.4.0
  - @evolu/nodejs@3.0.1

## 3.0.6

### Patch Changes

- Updated dependencies [3829805]
  - @evolu/common@8.3.3
  - @evolu/nodejs@3.0.1

## 3.0.5

### Patch Changes

- Updated dependencies [25901b6]
  - @evolu/common@8.3.2
  - @evolu/nodejs@3.0.1

## 3.0.4

### Patch Changes

- Updated dependencies [726e982]
  - @evolu/common@8.3.1
  - @evolu/nodejs@3.0.1

## 3.0.3

### Patch Changes

- Updated dependencies [34fa9df]
- Updated dependencies [f850ff8]
  - @evolu/common@8.3.0
  - @evolu/nodejs@3.0.1

## 3.0.2

### Patch Changes

- Updated dependencies [1487a7a]
- Updated dependencies [1487a7a]
  - @evolu/common@8.2.0
  - @evolu/nodejs@3.0.1

## 3.0.1

### Patch Changes

- Updated dependencies [d01ac49]
- Updated dependencies [d01ac49]
- Updated dependencies [13ee2e8]
  - @evolu/common@8.1.0
  - @evolu/nodejs@3.0.1

## 3.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)

### Patch Changes

- Updated dependencies [5a21b73]
- Updated dependencies [705c6af]
- Updated dependencies [555627d]
- Updated dependencies [86726aa]
- Updated dependencies [6fc3bba]
- Updated dependencies [2f39c8e]
- Updated dependencies [98a4b6c]
- Updated dependencies [ce83b24]
- Updated dependencies [c0250e9]
- Updated dependencies [408307b]
- Updated dependencies [97f5314]
- Updated dependencies [5275b07]
- Updated dependencies [b096543]
- Updated dependencies [1a04b81]
- Updated dependencies [cd6b74d]
- Updated dependencies [e6b166a]
- Updated dependencies [5a4d172]
- Updated dependencies [a883a8c]
- Updated dependencies [5f9602c]
- Updated dependencies [f7d505a]
- Updated dependencies [0af46e1]
- Updated dependencies [87780a3]
- Updated dependencies [f0bbebb]
- Updated dependencies [332dfca]
- Updated dependencies [6202f42]
- Updated dependencies [e10699b]
- Updated dependencies [65c1fe6]
- Updated dependencies [3247415]
- Updated dependencies [7da2364]
- Updated dependencies [66941ed]
- Updated dependencies [cebf659]
- Updated dependencies [6f1d6ea]
- Updated dependencies [0528425]
- Updated dependencies [29d37c7]
- Updated dependencies [3e3a93e]
- Updated dependencies [5f97e83]
- Updated dependencies [7fe328d]
- Updated dependencies [78a1a64]
- Updated dependencies [2c8576e]
- Updated dependencies [3ba2a92]
- Updated dependencies [a70d933]
- Updated dependencies [5720b0b]
- Updated dependencies [0fbb5e7]
- Updated dependencies [ef7f242]
- Updated dependencies [e948269]
- Updated dependencies [d1f817f]
- Updated dependencies [2abf93d]
- Updated dependencies [252ede2]
- Updated dependencies [252ede2]
- Updated dependencies [e96c8dd]
- Updated dependencies [d30b95a]
- Updated dependencies [b85837f]
- Updated dependencies [953c1fb]
- Updated dependencies [9ba5442]
- Updated dependencies [2516e46]
- Updated dependencies [3b74e48]
- Updated dependencies [c24ec2f]
- Updated dependencies [9373afa]
- Updated dependencies [151e73b]
- Updated dependencies [39084b3]
- Updated dependencies [5c55b05]
- Updated dependencies [65a86e2]
- Updated dependencies [4be336d]
- Updated dependencies [66cfc01]
  - @evolu/common@8.0.0
  - @evolu/nodejs@3.0.0

## 3.0.0-next.5

### Patch Changes

- Updated dependencies [0fbb5e7]
- Updated dependencies [63dce92]
  - @evolu/common@8.0.0-next.5
  - @evolu/nodejs@3.0.0-next.3

## 3.0.0-next.4

### Patch Changes

- Updated dependencies [a70d933]
- Updated dependencies [ef7f242]
  - @evolu/common@8.0.0-next.4
  - @evolu/nodejs@3.0.0-next.2

## 3.0.0-next.3

### Patch Changes

- Updated dependencies [f7d505a]
  - @evolu/common@8.0.0-next.3
  - @evolu/nodejs@3.0.0-next.2

## 3.0.0-next.2

### Patch Changes

- Updated dependencies [b096543]
- Updated dependencies [65c1fe6]
  - @evolu/common@8.0.0-next.2
  - @evolu/nodejs@3.0.0-next.2

## 3.0.0-next.1

### Patch Changes

- Updated dependencies [a883a8c]
- Updated dependencies [0af46e1]
- Updated dependencies [45e62ac]
  - @evolu/common@8.0.0-next.1
  - @evolu/nodejs@3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)

### Patch Changes

- Updated dependencies [6fc3bba]
- Updated dependencies [2f39c8e]
- Updated dependencies [98a4b6c]
- Updated dependencies [ce83b24]
- Updated dependencies [97f5314]
- Updated dependencies [5275b07]
- Updated dependencies [cd6b74d]
- Updated dependencies [5a4d172]
- Updated dependencies [87780a3]
- Updated dependencies [bfaa2ca]
- Updated dependencies [f0bbebb]
- Updated dependencies [332dfca]
- Updated dependencies [7da2364]
- Updated dependencies [6f1d6ea]
- Updated dependencies [0528425]
- Updated dependencies [5f97e83]
- Updated dependencies [7fe328d]
- Updated dependencies [3ba2a92]
- Updated dependencies [5720b0b]
- Updated dependencies [e948269]
- Updated dependencies [d1f817f]
- Updated dependencies [2abf93d]
- Updated dependencies [b956a5f]
- Updated dependencies [ece429b]
- Updated dependencies [d30b95a]
- Updated dependencies [953c1fb]
- Updated dependencies [9ba5442]
- Updated dependencies [3b74e48]
- Updated dependencies [c24ec2f]
- Updated dependencies [9373afa]
- Updated dependencies [4be336d]
  - @evolu/common@8.0.0-next.0
  - @evolu/nodejs@3.0.0-next.0

## 2.0.8

### Patch Changes

- Updated dependencies [e1ed69a]
  - @evolu/common@7.4.1
  - @evolu/nodejs@2.4.0

## 2.0.7

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0
  - @evolu/nodejs@2.4.0

## 2.0.6

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0
  - @evolu/nodejs@2.3.0

## 2.0.5

### Patch Changes

- Updated dependencies [adfd6af]
- Updated dependencies [7e7a191]
  - @evolu/common@7.2.3
  - @evolu/nodejs@2.2.1

## 2.0.4

### Patch Changes

- Updated dependencies [37e653c]
- Updated dependencies [de00f0c]
  - @evolu/common@7.2.2
  - @evolu/nodejs@2.2.1

## 2.0.3

### Patch Changes

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1
  - @evolu/nodejs@2.2.1

## 2.0.2

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0
  - @evolu/nodejs@2.2.0

## 2.0.1

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0
  - @evolu/nodejs@2.1.0

## 2.0.0

### Major Changes

- 897bbc8: Reduce Docker image size and improve runtime defaults.
  - Use `pnpm deploy --prod --legacy` to ship a minimal runtime; image ~116 MB (≈59 MB compressed).
  - Set `NODE_ENV=production` and add a robust TCP healthcheck.
  - Persist data under `/app/data` (declare VOLUME, ensure dir) and fix compose volume mapping.
  - Streamline README: concise Docker build/run with logs; remove web‑app testing section; place local steps under Docker.

- e4d1149: Improve Docker docs and remove Docker scripts

### Minor Changes

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

### Patch Changes

- Updated dependencies [36af10c]
- Updated dependencies [6452d57]
- Updated dependencies [eec5d8e]
- Updated dependencies [dd3c865]
- Updated dependencies [8f0c0d3]
- Updated dependencies [eec5d8e]
- Updated dependencies [6759c31]
- Updated dependencies [2f87ac8]
- Updated dependencies [6195115]
- Updated dependencies [eec5d8e]
- Updated dependencies [47386b8]
- Updated dependencies [202eaa3]
- Updated dependencies [f4a8866]
- Updated dependencies [eec5d8e]
- Updated dependencies [13b688f]
- Updated dependencies [a1dfb7a]
- Updated dependencies [45c8ca9]
- Updated dependencies [4a960c7]
- Updated dependencies [6279aea]
- Updated dependencies [02e8aa0]
- Updated dependencies [f5e4232]
- Updated dependencies [0911302]
- Updated dependencies [31d0d21]
- Updated dependencies [0777577]
- Updated dependencies [29886ff]
- Updated dependencies [eec5d8e]
- Updated dependencies [de37bd1]
- Updated dependencies [1d8c439]
- Updated dependencies [3daa221]
- Updated dependencies [eed43d5]
- Updated dependencies [05fe5d5]
- Updated dependencies [4a82c06]
  - @evolu/common@7.0.0
  - @evolu/nodejs@2.0.0

## 1.1.2-preview.17

### Patch Changes

- Updated dependencies [47386b8]
- Updated dependencies [4a960c7]
- Updated dependencies [0777577]
  - @evolu/common@6.0.1-preview.35
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.16

### Patch Changes

- Updated dependencies [8f0c0d3]
  - @evolu/common@6.0.1-preview.34
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.15

### Patch Changes

- Updated dependencies [2f87ac8]
  - @evolu/common@6.0.1-preview.33
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.14

### Patch Changes

- 897bbc8: Reduce Docker image size and improve runtime defaults.
  - Use `pnpm deploy --prod --legacy` to ship a minimal runtime; image ~116 MB (≈59 MB compressed).
  - Set `NODE_ENV=production` and add a robust TCP healthcheck.
  - Persist data under `/app/data` (declare VOLUME, ensure dir) and fix compose volume mapping.
  - Streamline README: concise Docker build/run with logs; remove web‑app testing section; place local steps under Docker.

## 1.1.2-preview.13

### Patch Changes

- e4d1149: Improve Docker docs and remove Docker scripts

## 1.1.2-preview.12

### Patch Changes

- Updated dependencies [a1dfb7a]
  - @evolu/common@6.0.1-preview.32
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.11

### Patch Changes

- Updated dependencies [202eaa3]
- Updated dependencies [eed43d5]
  - @evolu/common@6.0.1-preview.31
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.10

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- Updated dependencies [e2547d2]
- Updated dependencies [05fe5d5]
  - @evolu/common@6.0.1-preview.30
  - @evolu/nodejs@1.0.1-preview.12

## 1.1.2-preview.9

### Patch Changes

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

- Updated dependencies [36af10c]
- Updated dependencies [91c132c]
- Updated dependencies [6195115]
- Updated dependencies [13b688f]
  - @evolu/common@6.0.1-preview.29
  - @evolu/nodejs@1.0.1-preview.11

## 1.1.2-preview.8

### Patch Changes

- Updated dependencies [7216d47]
  - @evolu/common@6.0.1-preview.28
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.7

### Patch Changes

- Updated dependencies [a957aa0]
  - @evolu/common@6.0.1-preview.27
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.6

### Patch Changes

- Updated dependencies [f4a8866]
- Updated dependencies [02e8aa0]
- Updated dependencies [31d0d21]
  - @evolu/common@6.0.1-preview.26
  - @evolu/nodejs@1.0.1-preview.10

## 1.1.2-preview.5

### Patch Changes

- Updated dependencies [29886ff]
  - @evolu/common@6.0.1-preview.25
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.4

### Patch Changes

- Updated dependencies [1d8c439]
  - @evolu/common@6.0.1-preview.24
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.3

### Patch Changes

- Updated dependencies [dd3c865]
  - @evolu/common@6.0.1-preview.23
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.2

### Patch Changes

- Updated dependencies [446eac5]
  - @evolu/common@6.0.1-preview.22
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.1

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

- Updated dependencies [d913cf9]
  - @evolu/common@6.0.1-preview.21
  - @evolu/nodejs@1.0.1-preview.9

## 1.1.2-preview.0

### Patch Changes

- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [5c05d2e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20
  - @evolu/nodejs@1.0.1-preview.8
