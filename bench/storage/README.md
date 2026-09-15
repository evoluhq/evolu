# Storage benchmark

[`benchmark.mts`](./benchmark.mts) measures the SQLite timestamp Skiplist implemented in [`Storage.ts`](../../packages/common/src/local-first/Storage.ts).

## Workload

The benchmark runs fixed timestamp workloads against fresh in-memory SQLite
databases. This isolates SQLite engine and Storage algorithm performance from
filesystem and journaling variance. Skiplist levels use the production
`Math.random()` source:

- 50,000 ascending `append`, descending `prepend`, and shuffled `insert` operations in five transactions of 10,000 rows.
- 1,000 evenly distributed `getTimestampByIndex` calls in a 50,000-row Skiplist.
- 250 `fingerprintRanges` calls with 16 balanced buckets per Skiplist topology.

Timed regions contain only the measured operations. Setup, warmup, validation, and disposal are excluded. Primary insertion output preserves each 10,000-row interval; its overall result is the median total across runs. The `fingerprintRanges` result is the lowest timing across independent Skiplist topologies.

## SQLite planner statistics

The benchmark runs without SQLite's `ANALYZE` command or `PRAGMA optimize`, matching current production behavior. Collected statistics can change planner-sensitive access paths. Treat enabling them as a storage performance change: rerun every workload and verify `EXPLAIN QUERY PLAN` output on representative populated databases. See the rationale in [`Storage.ts`](../../packages/common/src/local-first/Storage.ts).

## Running

The benchmark uses three independent in-memory repeats for most methods and five independent Skiplist topologies for `fingerprintRanges`.

Run the benchmark:

```bash
pnpm bench:storage
```

Every complete result is compared with the exact matching environment baseline. The command fails when any result is more than 10% slower or when no baseline matches.

## Baselines

[`baselines.json`](./baselines.json) stores totals rounded to the nearest millisecond. A baseline matches the operating-system platform, architecture, CPU model, Node.js version, and SQLite version.

Run the benchmark in update mode to add or replace the current environment's baseline:

```bash
pnpm bench:storage --mode=update-baseline
```

Updates require all five results and all benchmark integrity checks. A normal update rejects regressions over 10%. Use the forced mode only when such a regression is understood and intentional:

```bash
pnpm bench:storage --mode=force-update-baseline
```

Forced updates bypass only the regression guard. Either update mode creates an initial baseline when none matches.

## Continuous integration

TODO: Run the benchmark in CI as a relative comparison. The exact-environment
baselines cannot be used on hosted runners: the CPU model changes between runs,
so no baseline would match, and timing noise on shared runners exceeds the 10%
threshold. Instead, one job checks out the base commit in a Git worktree, runs
the benchmark on the base and on the head in the same runner, and compares the
ratios with a wider threshold, around 20%. This cancels machine differences and
needs no CI baseline entry. It requires a benchmark mode that emits results as
JSON without comparing to baselines, plus a comparison step. Start it
non-blocking to learn the actual noise, then gate. Deterministic query-plan
checks stay in the storage tests; the comparison only guards constant factors.
