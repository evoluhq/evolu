# JSON binary codec benchmark

This benchmark guards the `JsonValue` MessagePack codec in
[`Binary.ts`](../../packages/common/src/Binary.ts) against accidental
performance regressions. It compares Evolu with msgpackr 2.0.5, configured like
the previous Protocol implementation with `variableMapSize: true` and
`useRecords: false`. Native acceleration is disabled so both codecs run in
JavaScript.

## Workloads

- **Small mixed object:** Adapted from msgpackr's
  [`example5.json`](https://github.com/kriszyp/msgpackr/blob/v2.0.5/tests/example5.json),
  used by [`benchmark.js`](https://github.com/kriszyp/msgpackr/blob/v2.0.5/tests/benchmark.js).
- **Large nested object:** Reuses msgpackr's
  [`example4.json`](https://github.com/kriszyp/msgpackr/blob/v2.0.5/tests/example4.json),
  used by [`benchmark.cjs`](https://github.com/kriszyp/msgpackr/blob/v2.0.5/tests/benchmark.cjs).

Each measurement processes 1,000 values. The benchmark keeps the fastest of
five warmed runs for every workload, codec, and operation.

## Run

```bash
pnpm bench:json-codec
```

Results are compared with the matching entry in
[`baselines.json`](./baselines.json). The command fails if no baseline matches
or a result is more than 10% slower. Add or update the current baseline with:

```bash
pnpm bench:json-codec --mode=update-baseline
```

Use the forced mode only for an understood and intentional regression:

```bash
pnpm bench:json-codec --mode=force-update-baseline
```
