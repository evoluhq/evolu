# Protocol runtime benchmark

This benchmark times Evolu's sync protocol in
[`Protocol.ts`](../../packages/common/src/local-first/Protocol.ts). The
[protocol benchmark](../protocol/README.md) counts its rounds, bytes, and SQL
work exactly; this one measures how long the same scenarios and the protocol's
building blocks take. Its gated metrics leave SQLite out: with real SQLite
relay storage, storage takes about 90% of every apply, so a 10% gate on whole
syncs could not see even a large regression in protocol code. SQLite timings
are reported beside them.

## Prerequisites

Use the Node.js version in [`.nvmrc`](../../.nvmrc) with the installed
dependencies. The benchmark loads Evolu from source, so it needs no build. It
needs about 1.3 GB of free memory.

Run the gated modes on an idle machine. Other work makes threads wait or run on
slower efficiency cores, which raises times by far more than the 10% threshold.
The benchmark prints the load average at the start and the end and warns when
the one-minute load is above a quarter of the logical CPUs, but it does not
refuse to run. While other work runs, compare commits with `--base` instead,
which pairs every measurement with one taken next to it.

## Workload

[`child.mts`](./child.mts) measures one case in a child process:
`node --expose-gc bench/protocol-runtime/child.mts <source root> <case>`. It
loads every Evolu module from that root, so the same harness measures the
working tree and a snapshot of another commit, and the
[protocol benchmark's](../protocol/README.md) load hook fails when it loads an
Evolu source from any other root. The parent runs children with
`NODE_ENV=production`, so Runs skip development-only work, such as capturing a
stack for leak detection, as a production bundle does.

### Reconcile scenarios

Eight scenarios of the protocol benchmark, with its datasets from
[`scenarios.mts`](../protocol/scenarios.mts):

| Scenario                  | Shape                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| `single-difference-100k`  | The client lacks one of 100,000 rows.                                |
| `download-20k`            | A fresh client downloads 20,000 rows.                                |
| `upload-20k`              | A client uploads 20,000 rows to an empty relay.                      |
| `random-halves-20k-30000` | 20,000 rows split at random between the sides, the default ranges.   |
| `random-halves-20k-3000`  | The same, with `rangesMaxSize` 3,000 on both sides.                  |
| `wide-halves-5k-30000`    | 5,000 rows of nearly the widest timestamp encoding, split at random. |
| `large-changes-download`  | 2,000 rows with six changes of 655,403 to 999,467 bytes.             |
| `push-5k-into-20k`        | Both sides store 20,000 rows; the client pushes 5,000 new messages.  |

Only public entry points drive the sync, as in the protocol benchmark: the
client's first request from `createProtocolMessageForSync`, or from
`createProtocolMessageFromCrdtMessages` when it pushes, then
`applyProtocolMessageAsRelay` and `applyProtocolMessageAsClient` until the
client converges. The relay gets the production options, including a
`broadcast` callback, so it builds broadcast frames and only delivery is
skipped.

The gated runs use [`memoryStorage.mts`](./memoryStorage.mts), an in-memory
Storage holding sorted timestamps with XOR prefix fingerprints. It is built
from the loaded version's own fingerprint function, sentinels, and range type,
so it answers as relay storage does, and its test compares every answer with
SQLite relay storage.

A child measures a scenario in this order:

1. One recording sync against in-memory storage counts each side's storage
   calls, parses every frame, and checks that both sides end with exactly the
   expected rows and bytes.
2. Warmup syncs against in-memory storage.
3. One sync against real in-memory SQLite relay storage on both sides for each
   of three skiplist topologies, from fixed seeds that every version shares.
   Each must send the recording's frames byte for byte, or the run fails, so
   no gated time is measured unless the in-memory storage behaved like SQLite.
4. Measured syncs against in-memory storage. Each must also send the
   recording's frames byte for byte, and both sides are checked again after
   the last.

### Micro benchmarks

Each uses only public API that both the working tree and `f082fdd97` have, so
a base comparison can run it. A call is one batch:

| Benchmark                          | One call                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `encrypt-1000`                     | `encodeAndEncryptDbChange` on 1,000 todo inserts with titles of 1 to 500 letters.                            |
| `decrypt-1000`                     | `decryptAndDecodeDbChange` on the same 1,000 changes.                                                        |
| `timestamps-buffer-5000`           | `createTimestampsBuffer`, `add` of 5,000 typical timestamps, and `append`.                                   |
| `upload-builder-5000`              | `createProtocolMessageFromCrdtMessages` over 5,000 messages, which fills one frame with about 3,000.         |
| `broadcast-builder-5000`           | `createProtocolBroadcastMessagesFromCrdtMessages` over 5,000 messages, which builds two frames.              |
| `relay-max-skip-ranges`            | A relay applies the largest ranges section it accepts, 200,000 bytes of about 100,000 Skip ranges.           |
| `relay-max-timestamps-range`       | A relay applies a 200,000-byte ranges section holding one Timestamps range of about 200,000 timestamps.      |
| `relay-messages-without-write-key` | A relay applies a 1 MB request of about 2,800 messages without a write key, rejected before storage is used. |

The relay requests are encoded by [`workload.mts`](./workload.mts) without
Evolu, so every version receives the same bytes, and the relay benchmarks
measure the private `decodeRanges` and `decodeMessages` through
`applyProtocolMessageAsRelay` against empty in-memory storage. Random bytes
for nonces come from a pool generated in advance from a fixed seed.

After measuring, each benchmark checks its last output: encrypted changes
decrypt to their inputs and match the bytes encrypted before measuring,
decrypted changes equal their inputs, the timestamps buffer equals the
harness's own encoding, a relay accepts the uploaded frame and stores every
message in it, the broadcasts hold all 5,000 messages, and each relay request
gets the expected error code without a write or a logged problem.

## Metrics

The primary clock is thread CPU time, `process.threadCpuUsage()` user plus
system, which counts only the measuring thread: neither other processes nor
idle waits add to it, while garbage collection on that thread does. Wall time
is recorded around the same regions and printed beside it.

Timed regions:

- **Reconcile scenarios:** each call of `applyProtocolMessageAsRelay` and of
  `applyProtocolMessageAsClient`, and the client's first request. A side's
  metric is the sum of its regions in one sync, so `<scenario>.relay` and
  `<scenario>.client` are gated, and `<scenario>.sqliteRelay` and
  `<scenario>.sqliteClient` are reported.
- **Micro benchmarks:** each call.

Excluded: process start and module loading, workload generation, building and
copying storages, loading SQLite, creating Runs, the recording sync, resetting
in-memory storage, and every check and disposal.

Warmup runs at least 5 passes and 100 ms of measured time; measurement at least
10 passes and 400 ms. The child keeps each metric's fastest pass. A garbage
collection between the SQLite passes and the measurement releases the SQLite
data; there is none between passes.

The reconcile report also prints rounds, request and response bytes, and an
end-to-end estimate: rounds times the round trip, plus each direction's bytes
at its bandwidth, plus both sides' CPU time with SQLite. Sync is strict request
and response, so nothing overlaps, and TCP slow start is ignored. The profiles
are broadband (20 ms round trip, 50 Mbit/s down, 10 Mbit/s up) and mobile (150
ms, 1.6 Mbit/s down, 0.75 Mbit/s up, Lighthouse's mobileSlow4G). The client
stand-in is relay storage, which neither decrypts changes nor applies them to
app tables, so client CPU time and the estimate are lower bounds.

## Run

```bash
pnpm bench:protocol-runtime
```

The benchmark runs five repeats. Each repeat starts a fresh child process for
every case, so a short burst of machine load slows at most one of the repeats a
metric keeps the fastest of, and JIT feedback never crosses cases. A metric's
result is the fastest pass of its fastest repeat. Every repeat must report the
same workload hash and the same work: rounds, bytes, frame hash, storage calls,
and each micro benchmark's output.

Default mode compares the gated metrics with the matching baseline and fails
when one is more than 10% slower, or when no baseline matches, in which case
it prints the entry to add. SQLite timings are printed with their change from
the baseline but never gate. Update the baseline on an idle machine:

```bash
pnpm bench:protocol-runtime --mode=update-baseline
```

A normal update writes when no baseline matches or no metric is more than 10%
slower. When the matching entry has other metrics, default mode fails, and
both update modes print the added and removed metrics and replace the entry.
Use the forced mode only for an understood and intentional regression:

```bash
pnpm bench:protocol-runtime --mode=force-update-baseline
```

The benchmark has no filters. Progress goes to stderr and the report to stdout.
It is not part of `pnpm verify` or CI, because its baselines hold one
machine's timings.

## Baselines

[`baselines.json`](./baselines.json) stores each environment's gated
`measurementsNs` and reported `reportedNs` in integer nanoseconds. An entry
matches when its platform, architecture, CPU model, Node.js version, SQLite
version, repeat count, `workloadSha256`, and `harnessSha256` are the same.

- `workloadSha256` combines each case's SHA-256 of the inputs the harness
  generated: rows and their bytes, pushed messages, random seeds including the
  skiplist seeds, and the encoded relay requests.
- `harnessSha256` is a SHA-256 of the harness modules whose code runs inside
  measured regions: [`measure.mts`](./measure.mts),
  [`memoryStorage.mts`](./memoryStorage.mts), [`micro.mts`](./micro.mts),
  [`reconcile.mts`](./reconcile.mts), and the protocol benchmark's
  [`scenarios.mts`](../protocol/scenarios.mts), whose PRNG draws the SQLite
  skiplist levels. After any edit to them, even to a comment, no baseline
  matches.

A changed workload or harness matches no baseline, so update the baseline in
the same change and remove the entries it replaces. An update replaces only the
matching entry. An entry written before an environment key was added cannot
match; runs skip it, and an update removes it.

## Comparing with another commit

```bash
pnpm bench:protocol-runtime --base=HEAD
```

`--base=<ref>` uses the protocol benchmark's snapshot of `<ref>` in the
gitignored `tmp/bench-base/<sha>/`, with the same refusal when dependencies
differ, and runs both versions alternately on the same machine. It never
reads or writes baselines, so it cannot be combined with an update mode.

For each case it runs five pairs of child processes, one per version, in ABBA
order: base then working tree, then working tree then base, and so on, with
pairs as the outer loop. Each pair's ratio is the working tree's fastest pass
over the base's. Per metric, the report prints both versions' fastest values
and the median of the paired ratios with their range. It prints each version's
rounds, bytes, and storage calls for reconcile scenarios, and labels a case
`different work` when any of its work differs, such as frames or a builder's
output. A median ratio from 1.03 is printed as slower; above 1.10, a gated
metric fails the command. SQLite ratios are printed but never fail it, nor do
cases whose workload hash differs between the versions.

## Runtime and memory

On an Apple M5, one repeat takes about 45 seconds, so the default and update
modes take about 3.5 minutes and a base comparison about 9. Most of it is the
SQLite passes, whose storages load before each topology. Children run one at a
time with a 1 GB V8 heap cap and peak at about 1 GB of RSS, in the 100,000-row
scenario.

## Noise

On an otherwise idle Apple M5, the two default runs right after an update
measured the gated metrics -1.8% to +2.9% and -1.5% to +1.6% from the
baseline, and no gated metric differed by more than 2.0% between the two runs.
The benchmark itself keeps about 1.3 cores busy, so the one-minute load
average stayed between 1.05 and 1.97 through the update and both runs. SQLite
timings of the short `large-changes-download` scenario differed by up to 12%
between the runs, which is one reason SQLite timings never gate.

With other work running and a load average around 3, an earlier pair of
default runs measured the gated metrics up to 14% slower than the baseline, and
the first failed six of them. Load that lasts minutes outlives the five
repeats, so while other work runs, compare commits with `--base` instead of
running the gated modes. Under that load, most of its paired ranges stayed
within a few percent, but a few cases ranged from 0.6 to 1.3 while the load
rose.
