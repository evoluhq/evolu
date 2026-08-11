# Type benchmark

The Type benchmark measures the TypeScript compiler cost of Evolu Type APIs. It compiles isolated Type programs with TypeScript 7's `tsc --extendedDiagnostics` to expose generic instantiation growth that ordinary correctness tests cannot detect.

The current Type benchmark has committed deterministic baselines. Run it
explicitly when changing Evolu Type declarations or benchmark infrastructure;
it fails when compiler work regresses.

## Running

```bash
pnpm bench:type
```

Default mode runs the complete matrix and compares it with the compatible
committed baseline. Pass one or more `--filter` options to run selected fixture
names or workload prefixes while developing a workload:

```bash
pnpm bench:type --filter=array-child-all
pnpm bench:type --filter=nested-object-all --filter=object-union-all
pnpm bench:type --filter=nested-object-all-32
```

A filtered run reports the same diagnostics and compares any matching committed
measurements, but it cannot update the baseline. Baseline updates remain
complete-matrix operations.

The benchmark uses Evolu Tasks and the platform's available parallelism to run independent
TypeScript compiler processes concurrently. Each compiler runs with
`--singleThreaded` because the benchmark already parallelizes whole fixtures and
measures the work of one type checker without TypeScript's internal checker
pool duplicating work. Before measuring, the benchmark also compiles the
depth-32 factory and declaration `all` fixtures with TypeScript's default
checker configuration. This separate typecheck catches behavior that
depends on the default checker pool without making the performance metrics
depend on it.

## Workloads

- A shared root Type establishes the fixed import and compiler-cost baseline.
- Each focused fixture exports only the inferred channels needed to force their
  evaluation.
- Scaling fixtures test whether brand-chain depth causes nonlinear growth or
  compiler depth failures.

The Type suite contains twenty-six isolated depth-scaling workloads at depths
1, 2, 4, 8, 16, and 32, six width-scaling workloads at widths 2, 4, 8, 16,
and 32, plus nineteen standalone workloads:

- `factory-output` forces only the final output of a factory-created chain.
- `factory-errors` forces only the complete error union of a factory-created chain.
- `factory-from-unknown` forces the public unknown-input validation operation.
- `factory-deepest` forces only the deepest callable `from.parent` suffix.
- `factory-all` forces output, complete errors, and every callable suffix.
- `factory-or-throw` forces the flat `orThrow` convenience operation.
- `factory-or-null` forces the flat `orNull` convenience operation.
- `factory-semantic-all` forces output, errors, and every callable `from.parent`
  suffix from a chain of brands without refinement callbacks.
- `array-output` forces the output of an Array Type over a validated brand chain.
- `array-errors` forces its complete structural and element error union.
- `array-from-unknown` forces its public unknown-input validation operation.
- `array-all` forces output, errors, `fromUnknown`, and every callable
  `from.parent` suffix.
- `array-semantic-all` forces the same channels over a semantic brand chain.
- `set-output` forces the output of a Set Type over a validated brand chain.
- `set-errors` forces its complete structural and element error union.
- `set-from-unknown` forces its public unknown-input validation operation.
- `set-all` forces output, errors, `fromUnknown`, and every callable
  `from.parent` suffix.
- `set-semantic-all` forces the same channels over a semantic brand chain.
- `nested-array-all` forces output, errors, `fromUnknown`, and `from` through
  recursively nested Array Types.
- `nested-set-all` forces output, errors, `fromUnknown`, and `from` through
  recursively nested Set Types.
- `nested-object-all` forces input, output, errors, `fromUnknown`, `from`, and
  `to` through recursively nested Object Types around a transformed leaf.
- `object-all` forces required and optional property output, errors,
  `fromUnknown`, and `from` over a validated brand chain.
- `record-all` forces partial input and output shapes, normalized entry errors,
  `fromUnknown`, `from`, and `to` over a validated value chain.
- `declaration-output` forces only the final output from manually declared `BrandType` aliases.
- `declaration-errors` forces only the complete error union from manually declared `BrandType` aliases.
- `declaration-all` forces the same channels from manually declared `BrandType` aliases, separating declaration expansion from factory inference.
- `brand-direct-all` and `brand-factory-all` force equivalent direct and
  reusable Brand declarations over a deep parent, including complete errors and
  `from` boundaries. Their difference isolates the reusable `BrandFactory`
  contract and application cost.
- `constraints-all` forces representative curried string and number
  constraints through Label and Age declarations, including their staged
  `from.parent` boundaries.
- `literal-all` forces string and number Literal Type outputs and errors together
  with Array Type composition.
- `union-all` forces output, errors, `fromUnknown`, `from`, members, and parent
  across a widening flat Union.
- `literal-union-all` forces the same channels through the literal-value Union
  shorthand.
- `mixed-union-all` forces the same channels through a Union alternating
  non-Literal child Types and literal-value shorthand. This covers mixed
  overload normalization and the general Union error path rather than the
  all-Literal fast path.
- `object-width-all` forces required and optional property output, errors,
  `fromUnknown`, and `from` across a widening Object Type.
- `object-union-all` forces input, output, correlated errors, `fromUnknown`,
  `from`, and `to` across a widening Union of discriminated Object Types.
- `discriminated-union-all` forces exact discriminator correlation, routed
  errors, `fromUnknown`, `from`, `to`, key, members, and parent across a
  widening Discriminated Union of Object Types.
- `transform-all` forces the decoding error channel and the complete `from`,
  `to`, and `from.parent` operations through four transformations.
- `union-array-all` forces output, errors, `fromUnknown`, `from`, and parent for
  an Array Type over the width-32 Union.
- `array-child-all` forces the specialized Array `from` operation through a
  fallible child followed by one infallible child Type.
- `union-object-all` forces required and optional properties over the width-32
  Union, including their structural and trusted-boundary errors.
- `transform-object-all` forces required and optional transformed properties
  through an Object Type's input, output, validation, and encoding channels.
- `typed-all` forces the discriminator plus Object input, output, errors,
  reflection, decoding, and encoding.
- `object-record-all` forces compatible declared Object properties with
  transformed Record values through input, output, validation, and encoding.
- `object-transform-all` forces a transformation whose parent and output are
  Object Types, including its output-error wrapper and parent boundary.
- `object-array-all` forces an Array Type over an Object with transformed and
  optional properties.
- `object-child-all` forces a fallible child and a repeated child over an Object
  Type while keeping child errors outside inherited property errors.
- `record-transform-all` forces transformed key and value representations,
  decoded-key collisions, encoding, and child composition through a Record
  Type.
- `lazy-direct-all` forces an explicitly declared transformed recursive Type's
  input, output, trusted-from error, input error, complete errors, operations,
  and terminal parent.
- `lazy-mutual-all` forces the same recursive channels for both sides of an
  explicitly declared mutually recursive pair.
- `localize-lazy-direct-all` forces formatter-key and callback inference through
  an explicitly declared directly recursive error graph for two locales.
- `localize-lazy-mutual-all` forces the same localization inference through both
  sides of a mutually recursive error graph.

Composition workload names list the inner Type before the outer Type. For
example, `union-array-all` is an Array of a Union, while `object-union-all` is a
Union of Objects.

A depth-`n` brand chain exposes `n` callable `.parent` suffixes. `from` accepts
the final Output, the first suffix accepts the immediate parent Output, and
each additional suffix moves that typed boundary toward the root. The final
suffix accepts the root Output.

Every validation node has a distinct tagged error with a distinct payload so
TypeScript cannot collapse the accumulated union. Each workload is a committed,
isolated entrypoint under [`fixtures`](./fixtures). Shared root and incremental
factory/declaration chain modules live under [`fixtures/chains`](./fixtures/chains),
so the exact code compiled for every measurement is reviewable without runtime
source generation.

## Roadmap

The current brand-chain suite is sufficient for developing the Type semantic
core. It measures the parent-derived error union, callable `from.parent`
suffixes, and the difference between manually declared Types and factory
inference across a depth curve.

Development should extend the benchmark together with the Type API:

1. Use the existing suite to evaluate changes to the core Type and brand
   declarations. Isolate alternative factory signatures in separate fixtures
   when a result needs attribution to parent validation, refinement callback
   inference, or another specific declaration.
2. Add focused suites as tuples and other semantic constructors are designed.
   Measure only semantics that Evolu actually supports.
3. Give every new suite compile-time semantic assertions before accepting its
   performance results. Then add isolated workloads for the relevant output,
   error, and `from` projections, plus a depth or width curve where composition
   can grow.
4. Commit reviewed deterministic baselines only after the fixture semantics and
   shape are stable. Use stress fixtures to find compiler limits only when a
   scaling curve or real API composition indicates that the limit matters.

TODO: Add consumer fixtures that import Type through `@evolu/common` so the
benchmark also measures the published declaration and export surface.

## Metrics

Each fixture subtracts the shared root program from its compiler diagnostics.
The resulting marginal instantiation and materialized-type counts are exact,
zero-tolerance regression gates: decreases pass, while any increase fails.
Successful compilation at every depth is also required.

The benchmark also records memory and the files, lines, and identifiers in each
compiler program. These supporting diagnostics help distinguish generic
instantiation growth from type-relation work, memory pressure, or an accidentally
changed workload. Symbols are a committed diagnostic but do not fail default
mode. Files, lines, and identifiers are exact workload-integrity checks and fail
default mode when they change. Memory and timing are environment-sensitive, so
they are printed but neither committed nor gated. Parallel compiler processes can
contend for CPU and memory, so those values are diagnostic snapshots rather than
isolated per-fixture performance measurements.

## Baselines

[`baselines.json`](./baselines.json) stores every deterministic metric as a
marginal value. A baseline matches the suite version, exact TypeScript version,
and exact compiler argument list. This prevents a compiler or configuration
change from being compared as though it were an Evolu Type change.

Run update mode after reviewing an intentional improvement, diagnostic change,
or workload change:

```bash
pnpm bench:type --mode=update-baseline
```

Normal updates reject increased instantiations or types. Use forced update only
when such a regression is understood and accepted:

```bash
pnpm bench:type --mode=force-update-baseline
```

Forced updates bypass only the compiler-cost regression guard. Both update
modes still compile the complete fixture matrix successfully. A TypeScript
upgrade creates a separately keyed baseline rather than silently replacing an
incompatible measurement. The suite uses only TypeScript 7; TypeScript 6
compatibility is checked separately against generated package declarations.
