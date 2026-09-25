# Type runtime benchmark

This benchmark guards the runtime performance of Evolu Types in
[`Type.ts`](../../packages/common/src/Type.ts) against accidental regressions.
It measures the operations that [schemabenchmarks.dev](https://schemabenchmarks.dev/)
compares across validation libraries, on the same Product workload.

## Prerequisites

Use the Node.js version in [`.nvmrc`](../../.nvmrc). The benchmark imports
`@evolu/common` from source, so it needs no build.

## Workload

[`workload.mts`](./workload.mts) defines the Product schema and data adapted
from the schemabenchmarks.dev
[`data.ts`](https://github.com/open-circle/schema-benchmarks/blob/f8dff47750d26244613d55725b0dc618f2f443d6/schemas/src/data.ts)
(MIT). A Product is a nested object with refined strings and numbers, a
nullable number, a Date, a literal union, a URL brand, and arrays of images and
ratings. The valid Product is about 1.6 KB as JSON. The invalid one has 15
issues. Dates are fixed so the data is deterministic.

Scenarios:

- **Create schema:** creates the Product Type and all its nested Types.
- **`is`**, valid and invalid.
- **`fromUnknown`**, valid, and invalid with the first-error and all-errors
  modes.
- **`~standard.validate`**, valid and invalid.

## Metrics

Each measurement runs one scenario in a fresh Worker, whose own V8 isolate
keeps JIT feedback from one scenario out of another. The Worker creates the
Product Type, then `@paulmillr/jsbt` warms the scenario up for 100 ms and
measures it for 400 ms. Each measured callback performs 100 operations, and the
result is the mean duration of one operation.

Each operation stores its result. After measurement, the Worker checks the last
one and every operation of the Product Type on valid, invalid, and deeply
invalid data, including returned value identity, issue paths, and messages, so
a faster but incorrect implementation fails. Creating the Worker and the
initial Product Type and checking results are not measured.

The benchmark measures every scenario once per run and makes five runs, so a
short burst of machine load slows at most one of a scenario's measurements. It
keeps the fastest measurement of each scenario.

## Run

```bash
pnpm bench:type-runtime
```

Results are compared with the matching entry in
[`baselines.json`](./baselines.json). An entry matches when its platform,
architecture, CPU model, Node.js version, batch size, repeat count, and the
SHA-256 of `workload.mts` are the same. The command fails if no baseline
matches or a result is more than 10% slower. Add or update the current baseline
with:

```bash
pnpm bench:type-runtime --mode=update-baseline
```

Use the forced mode only for an understood and intentional regression:

```bash
pnpm bench:type-runtime --mode=force-update-baseline
```

A changed workload matches no baseline, so update the baseline in the same
change and remove the entries it replaces.

The benchmark has no filters and writes results to stderr.
