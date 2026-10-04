# Protocol benchmark

This benchmark measures the work of Evolu's sync protocol in
[`Protocol.ts`](../../packages/common/src/local-first/Protocol.ts) together
with the relay storage it drives in
[`Storage.ts`](../../packages/common/src/local-first/Storage.ts) and
[`Relay.ts`](../../packages/common/src/local-first/Relay.ts). It counts rounds,
bytes, and SQL work instead of time, so its results are exact and the same on
every machine. It can also compare the working tree with any commit. The
[protocol runtime benchmark](../protocol-runtime/README.md) times the same
scenarios.

## Prerequisites

Use the Node.js version in [`.nvmrc`](../../.nvmrc) with the installed
dependencies. The benchmark loads Evolu from source, so it needs no build. It
needs about 1.4 GB of free memory.

## Workload

[`scenarios.mts`](./scenarios.mts) generates the datasets and scenarios, and
[`workload.mts`](./workload.mts) is the harness. [`benchmark.mts`](./benchmark.mts)
runs it in a child process with `node bench/protocol/workload.mts <source root>`,
which loads every Evolu module from that root. The scenarios, the `--base`
snapshot in [`base.mts`](./base.mts), the child process helpers in
[`child.mts`](./child.mts), and the frame parser in [`frames.mts`](./frames.mts)
are shared with the protocol runtime benchmark.

Each scenario syncs two real in-memory SQLite relay storages. Relay storage
serves stored bytes without decrypting them, so one of them stands in for the
client. Client storage that decrypts changes and applies them to app tables is
client work, not protocol work, and is out of scope.

Only public protocol entry points drive the sync:

1. The client builds the first request with `createProtocolMessageForSync`, or
   with `createProtocolMessageFromCrdtMessages` in push scenarios.
2. The relay answers with `applyProtocolMessageAsRelay`.
3. The client replies with `applyProtocolMessageAsClient`, passing its write key,
   and `onChangeTooLarge` when the loaded version supports it.
4. Steps 2 and 3 repeat until the client returns `Converged`, a failure, or the
   relay has answered 1,000 requests.

Scenario names ending in a `rangesMaxSize` pass it to both sides. The others use
the library default, as the production client and relay do. Both sides use the
default frame size.

A seeded PRNG owned by the harness (mulberry32) generates every input, so a
dependency upgrade cannot shift them:

- **Typical rows** start at millis 1,700,000,000,000. Each row starts a new
  batch with probability 0.3, which adds 1 to 600,000 ms and resets the counter;
  otherwise it increments the counter at the same millis. With probability 0.2,
  a new batch picks one of four devices at random. Changes are 100–199 bytes for
  70% of rows, 200–999 for 25%, and 1,000–9,999 for 5%. The 20,000-row datasets
  are prefixes of the 100,000-row one.
- **Wide rows** have nearly the widest timestamp encoding, as in
  `Protocol.test.ts`: millis (i+1)·2³⁵, counter 16,384+i, and a NodeId per row.
- **A generated change** is its row's 16 timestamp bytes followed by zeros, so a
  change delivered under the wrong timestamp fails verification.
- **Large changes** use PADMÉ-padded lengths: 655,403 bytes, the largest change
  within `maxMutationSize`; 983,083 and 999,467 bytes, legacy sizes that still
  fit a message; and 1,015,851 bytes, which fits no message.
- **Pushed changes** are real CRDT messages with seeded ids and titles, which
  Evolu encodes and encrypts with seeded nonces. The push uses the same nonces,
  so it reproduces the bytes the client stores.

| Scenario                                | State before sync                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `in-sync-100k`                          | Both sides store the same 100,000 typical rows.                                          |
| `single-difference-100k`                | The client lacks row 50,000.                                                             |
| `tail-100k`                             | Each side also has 50 new rows from another device, interleaved in time.                 |
| `scattered-100k-{3000,30000,100000}`    | Each side lacks a different 100 seeded rows.                                             |
| `download-20k`, `upload-20k`            | Only the relay, or only the client, stores 20,000 typical rows.                          |
| `random-halves-20k-{3000,30000,100000}` | A seeded shuffle of 20,000 typical rows is split between the sides.                      |
| `wide-halves-5k-{3000,30000,100000}`    | A seeded shuffle of 5,000 wide rows is split between the sides.                          |
| `large-changes-download`, `-upload`     | One side stores 2,000 typical rows, two each of 655,403, 983,083, and 999,467 bytes.     |
| `oversized-change-upload`               | The client stores 2,000 typical rows, one of 1,015,851 bytes, which stays on the client. |
| `push-100-into-20k`, `push-5k-into-20k` | Both sides store 20,000 rows, and the client pushes 100 or 5,000 new CRDT messages.      |

The 5,000-message push overflows the first request, so sync continues.

## Metrics

Counting covers only the sync loop, from building the first request until the
outcome. Loading the storages, hashing inputs, and verification are excluded.
Wrappers count every call of every Storage method, rows consumed by `iterate`,
and buckets of `fingerprintRanges`. A wrapper under each storage counts SQLite
statements, returned rows, and transactions, which include work the Storage
interface hides, such as timestamp lookups and usage updates. A frame parser
built only on the exported `Bytes` decoders reads every frame independently of
the protocol's own decoding.

**Cost** metrics are gated; any increase is a regression:

- `rounds`: requests the client sent. The relay answers each one, so frames per
  direction equal rounds.
- `bytes`: all request and response bytes. Each direction's bytes are
  diagnostics, so moving bytes from one direction to the other does not fail.
- `redundantMessages`: messages written to a side that already stored their
  timestamp, in both directions.
- `clientSqlStatements`, `clientSqlRows`, `relaySqlStatements`, and
  `relaySqlRows`. They include `iterate` overfetch and reads of changes that
  were not sent. Statements cost the most in a WASM and OPFS client.

**Diagnostics** are stored and printed when they change, but never gate:

- per direction: bytes, the largest frame, ranges-section bytes and the largest
  ranges section, messages, change bytes, Skip, Fingerprint, and Timestamps
  ranges, and timestamps listed in Timestamps ranges;
- per side: calls of each Storage method, `iterateRows`,
  `fingerprintRangesBuckets`, `sqlTransactions`, and `unsentReads`, the changes
  read but not sent;
- `changeTooLargeReports`;
- `framesSha256`, a SHA-256 over every frame. It stays the same exactly when a
  change sends identical bytes, as a pure refactor must.

The **workload** descriptor of each scenario is an exact integrity check: its
`rangesMaxSize`, pushed message count, and for each side the row count, change
bytes, and a SHA-256 the harness computes over the rows in timestamp order. A
pushed change counts and hashes its id and title rather than the bytes Evolu
encodes, so a descriptor never depends on the code under test, and an encoding
change shows up as a cost change.

The **outcome** is `Converged`, `RoundLimit`, `Relay:<error>`,
`Client:<error or result>`, or `Threw`.

## Invariants

Every run checks these in every mode, and no baseline stores them:

- the outcome is `Converged` within 1,000 rounds;
- both sides store exactly the expected rows with the exact bytes: the union of
  both sides, without a held-back change on the side that lacked it;
- every frame is at most 1,000,000 bytes, the default limit of both peers;
- every ranges section is at most its sender's `rangesMaxSize`; the first
  request uses the default because `createProtocolMessageForSync` has no option;
- neither side's Run logged `console.error`;
- every held-back change was reported through `onChangeTooLarge` at least once;
- every frame parses with no bytes left over.

After the full run, a determinism canary runs `large-changes-upload`,
`oversized-change-upload`, `wide-halves-5k-3000`, and `push-5k-into-20k` again.
Their measurements must be identical, or the run fails with nondeterministic
metrics rather than reporting a misleading regression. The reruns must also
meet every invariant above; a violation fails the run as one of the first run's
would.

## Run

```bash
pnpm bench:protocol
```

Default mode compares the working tree with the committed baseline. It fails on
an invariant violation, a canary mismatch, a missing baseline, an added or
removed scenario, a changed workload descriptor, or any cost increase. Without a
baseline, it prints the complete entry. Cost decreases pass and are listed as
improvements; update the baseline to lock them in. Diagnostic changes are
printed under each scenario.

There is no tolerance, because there is no noise: separate runs produce
identical measurements.

Update the baseline after reviewing a change:

```bash
pnpm bench:protocol --mode=update-baseline
```

A normal update accepts changed workloads and scenarios but rejects a cost
increase in a scenario whose workload did not change. Use the forced mode only
for an understood and intentional regression:

```bash
pnpm bench:protocol --mode=force-update-baseline
```

Both update modes still require every invariant and the canary.

## Baselines

[`baselines.json`](./baselines.json) stores each scenario's workload, outcome,
cost, and diagnostics. An entry matches the suite version only. It has no
platform, CPU, Node.js, or SQLite keys, because the metrics do not depend on
them. Bump the suite version in [`benchmark.mts`](./benchmark.mts) when the
harness changes what a metric counts; the workload descriptors catch workload
changes. Adding or removing a metric also bumps the suite version, and an update
keeps only the entry of the current one.

## Comparing with another commit

```bash
pnpm bench:protocol --base=HEAD
```

`--base=<ref>` runs the same harness on `<ref>` and on the working tree and
prints them side by side. It never reads or writes baselines, so it cannot be
combined with an update mode, and the canary does not run.

The benchmark resolves `<ref>` to a commit and refuses to run when
`pnpm-lock.yaml` differs between it and the working tree, because the base
reuses the current install. The lockfile records the dependencies of every
workspace package, so a release, which changes only package versions, is
accepted. It extracts the `package.json` files and
`src` directories of `@evolu/common` and `@evolu/nodejs`, without tests, with
`git archive` into the gitignored `tmp/bench-base/<sha>/`. A
`node_modules/@evolu/common` link in it points to its own `packages/common`, so
its `@evolu/nodejs` sources do not import the working tree. An existing snapshot
is reused, and `pnpm clean` removes them. Git is only read; the index and the
working tree are untouched.

Each version runs in its own child process, because Evolu sentinels and
polyfills are per module graph. A load hook fails a child that loads an Evolu
source from any other root.

For each scenario, the report prints the outcome, the cost metrics, and the main
diagnostics of both versions with their difference. It labels scenarios whose
outcome or workload differs and says whether the frames are identical. A
scenario whose frames and printed metrics are all the same takes one line. The
report ends with how many cost metrics are lower, the same, or higher in the
scenarios with the same outcome and workload. The base's outcome and violations
are data: at `f082fdd97`, `oversized-change-upload` reaches the round limit.
The command fails only when the working tree violates an invariant.

## Runtime and memory

On an Apple M5, the 19 scenarios take about 25 seconds and the canary about 1.3
seconds, mostly loading two 100,000-row databases per 100k scenario. A base
comparison runs both versions in about 50 seconds. Each child process peaks at
about 1.3 to 1.4 GB of RSS, and children run one at a time. A macrotask between
scenarios lets V8 collect the previous one, so the benchmark needs neither
`--expose-gc` nor `--max-old-space-size`.

The benchmark has no filters. It prints progress to stderr and the report to
stdout. It runs in `pnpm verify` and in the Checks workflow on CI, where the
baseline matches because the measurements do not depend on the machine.
