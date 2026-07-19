# Benchmarks

Benchmarks measure performance characteristics that ordinary correctness tests do not cover. Each benchmark suite owns its workload, measurement method, baselines, and detailed documentation in a dedicated directory.

## Suites

- [Storage](./storage/README.md) measures SQLite timestamp Skiplist operations.

## Commands

Each suite exposes one script in the `benchmark:<suite>` namespace and uses
these mutually exclusive modes:

```bash
pnpm benchmark:<suite>
pnpm benchmark:<suite> --mode=default
pnpm benchmark:<suite> --mode=update-baseline
pnpm benchmark:<suite> --mode=force-update-baseline
```

Omitting `--mode` selects `default`.

## Modes

- `default`: Runs the complete workload, compares every result with its baseline,
  and fails on regression.
- `update-baseline`: Runs the complete workload and writes the baseline only
  when results pass or no matching baseline exists.
- `force-update-baseline`: Runs the complete workload and writes the baseline
  despite an intentional performance regression.

Do not let a partial or filtered run update a baseline.

## Methodology

A benchmark must isolate the behavior it claims to measure:

- Use deterministic inputs and seeded randomness when possible.
- Keep setup, cleanup, assertions, and fixture generation outside the measured region.
- Give each independent scenario fresh state unless shared state is part of the workload.
- Verify outputs outside the measured region so a faster but incorrect implementation cannot pass.
- Report scenarios independently so an improvement in one cannot hide a regression in another.
- Prefer stable work metrics over elapsed time when the underlying tool exposes them.

Choose workloads that represent production behavior and add focused scenarios for important paths hidden by the normal distribution. Document the workload size, state, repetitions, measured region, excluded work, and aggregation method in the suite README.

## Baselines

Store committed baselines in `<suite>/baselines.json`. Include every environment property required to determine whether results are comparable.

Compare each result only with a compatible baseline; fail when none is available.

Baseline updates must be explicit and complete. A normal update rejects regressions; a forced update bypasses only that guard and still requires the complete workload and all benchmark integrity checks.

## Adding a suite

Create a directory containing:

```text
benchmarks/<suite>/
  README.md
  benchmark.mts
  baselines.json
```

Expose one package script, parse the shared mode with [parseBenchmarkMode](./index.mts), and list the suite above. The suite README must explain prerequisites, workload, metrics, regression thresholds, baseline matching, and any filtering or output modes.
