# Benchmarks

## Storage benchmark

[`storage/benchmark.mts`](./storage/benchmark.mts) measures `insertTimestamp` performance for the SQLite timestamp Skiplist implemented in [`Storage.ts`](../packages/common/src/local-first/Storage.ts).

Build the packages before running the benchmark because the script imports their generated `dist` files:

```bash
pnpm build
```

### Workload

Every benchmark scenario inserts 50,000 deterministic timestamps in five transactions of 10,000 rows. It measures three insertion methods:

- `append`: timestamps in ascending order.
- `prepend`: timestamps in descending order.
- `insert`: timestamps in a deterministic shuffled order.

Each method gets a fresh database and the same seeded Skiplist-level random sequence. The timed region contains only the insert transaction. Database setup, size checks, fingerprint checks, disposal, and file cleanup are excluded.

The detailed output preserves each 10,000-row interval so size-dependent degradation remains visible. The `Overall` section sums all five intervals within each run, then reports the median 50,000-row duration across runs for each method.

### Profiles

| Profile | Repeats | SQLite modes    | Purpose                                |
| ------- | ------: | --------------- | -------------------------------------- |
| `quick` |       1 | Memory          | Fast feedback while changing SQL       |
| `full`  |       3 | Memory and file | Stable comparison and baseline updates |

The full profile is the default:

```bash
pnpm benchmark:storage:quick
pnpm benchmark:storage:check
pnpm benchmark:storage
pnpm benchmark:storage --profile=quick
pnpm benchmark:storage --profile=full
```

A positive percentage means the current code is slower than the baseline. A negative percentage means it is faster:

```text
memory append: 534ms, 93,472 inserts/sec, n=1, baseline 536ms, -0.29%
memory prepend: 1162ms, 43,025 inserts/sec, n=1, baseline 1187ms, -2.13%
memory insert: 5573ms, 8,970 inserts/sec, n=1, baseline 5565ms, +0.15%
```

Ordinary quick and full comparisons are informational. Use the regression check when a performance change should affect the exit code.

### Regression check

Run the quick storage regression check explicitly after building the packages:

```bash
pnpm benchmark:storage:check
```

The check compares the complete 50,000-row memory total for each method against the exact matching environment baseline. It fails when append, prepend, or insert is more than 10% slower. Each method is gated independently so an improvement in one method cannot hide a regression in another.

The quick profile uses one run to keep local verification fast. The committed baseline uses the median of three full-profile runs.

If no baseline matches the current environment, the check prints a skip message and exits successfully. Contributors with different hardware can add their environment with a full baseline update when useful.

Filters and baseline updates are rejected in check mode because they would produce an incomplete or changing reference. The check is intentionally separate from `pnpm verify` because benchmark results depend on hardware and system load. A future dedicated CI benchmark can use the same mechanism after its environment has a committed baseline.

### Baselines

[`storage/baselines.json`](./storage/baselines.json) stores exact nanosecond totals for multiple environments. A baseline matches only when all environment fields match:

- Operating-system platform.
- Architecture.
- CPU model.
- Node.js version.
- SQLite version.

This prevents results from different hardware or runtimes from being compared directly. Developers and CI runners can contribute separate entries to the same file.

Run an unfiltered full benchmark to add or replace the baseline for the current environment:

```bash
pnpm benchmark:storage:update-baseline
```

Baseline updates require all three repeats, both SQLite modes, all methods, and all checkpoints. Quick or filtered benchmarks cannot update the file.

When no environment matches, a quick run explains how to create one. An unfiltered full run also prints the complete JSON entry, which can be reviewed and added manually.

Commit a baseline update only after confirming that the measured behavior is the intended reference. Updating a baseline accepts the current performance; it is not part of an ordinary benchmark comparison.

### A/B workflow

1. Run `pnpm benchmark:storage:quick` before changing the storage SQL.
2. Make the change and rerun the same command.
3. Compare the overall append, prepend, and insert totals.
4. Use the detailed 10,000-row intervals to locate any size-dependent change.
5. Run `pnpm benchmark:storage` before accepting the change.
6. Run `pnpm benchmark:storage:check` to exercise the automatic gate.
7. Update the baseline only when the new implementation should become the committed reference.

For a strict A/B test that must survive unrelated baseline changes, record the baseline revision's output before switching revisions, then run the candidate on the same machine under the same load conditions.

### Filtering and CSV

`JSBT_FILTER` runs labels containing the provided substring:

```bash
JSBT_FILTER="memory insert" pnpm benchmark:storage
JSBT_FILTER="memory insert run 1 40000-50000 rows" pnpm benchmark:storage
```

An overall method result is printed only when all five checkpoints for that method and run were measured. A single-checkpoint filter therefore prints detailed timing without an overall total.

Set `JSBT_CSV=1` to write the detailed jsbt measurements as CSV to stdout. Environment and overall summaries are written to stderr, so stdout can be redirected without mixing formats:

```bash
JSBT_CSV=1 pnpm benchmark:storage > storage.csv
```
