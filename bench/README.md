# Benchmarks

Benchmarks measure performance characteristics that ordinary correctness tests do not cover. Each benchmark suite owns its workload, measurement method, baselines, and detailed documentation in a dedicated directory.

## Suites

- [JSON binary codec](./json-codec/README.md) measures `JsonValue` MessagePack
  encoding and decoding against msgpackr.
- [Protocol](./protocol/README.md) measures deterministic sync protocol work:
  rounds, bytes, and SQL statements and rows.
- [Protocol runtime](./protocol-runtime/README.md) times sync protocol code
  without SQLite, and reports the same syncs with SQLite relay storage.
- [SQLite comparison](./sqlite-comparison/README.md) compares Evolu's SQLite
  with the alternatives on Node.js, the web and React Native, and gates the
  relay's move to it.
- [SQLite Wasm](./sqlite-wasm/README.md) measures SQLite stacks on OPFS in
  Chromium, Firefox, and WebKit with wa-sqlite's benchmark workloads.
- [Storage](./storage/README.md) measures SQLite timestamp Skiplist operations.
- [Type](./type/README.md) measures deterministic TypeScript compiler work for Evolu Type APIs.
- [Type runtime](./type-runtime/README.md) measures Evolu Type validation and
  construction with the schemabenchmarks.dev Product workload.

## Commands

Each suite exposes one script in the `bench:<suite>` namespace and uses
these mutually exclusive modes:

```bash
pnpm bench:<suite>
pnpm bench:<suite> --mode=default
pnpm bench:<suite> --mode=update-baseline
pnpm bench:<suite> --mode=force-update-baseline
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

## Continuous integration

The Checks workflow runs the suites that count deterministic work, Type and
Protocol, against their baselines. Timing baselines match one machine, so the
Bench workflow instead compares the head of each push to main, pull request and
merge group with the anchor of Protocol runtime and of Storage, on the same
hosted runner, with `--base-checkout` and a 20% threshold, as
[CI compares benchmark timings with an explicit anchor](../docs/adr/ci-compares-timings-with-an-explicit-anchor.md)
decides.

A suite's anchor is the last commit that changed its `ci-anchor.txt`, a line
that says why the anchor last moved. Recording a baseline does not move it.
Rewrite that line to accept a regression in CI, or in the same commit as a
change to the suite's harness or workload, which makes the head and the anchor
not comparable. When a run's commits move an anchor, the workflow compares the
head with the previous anchor without gating, so its summary shows what the
move accepted, or, after a harness or workload change, that the two were not
comparable. No check requires the workflow yet; it joins them once its runs
show the spread on hosted runners.

## Adding a suite

Create a directory containing:

```text
bench/<suite>/
  README.md
  benchmark.mts
  baselines.json
```

Expose one package script, parse the shared mode with [parseBenchmarkMode](./index.mts), and list the suite above. The suite README must explain prerequisites, workload, metrics, regression thresholds, baseline matching, and any filtering or output modes.
