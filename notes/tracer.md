# Tracing

## Goal

Add optional, vendor-neutral tracing for important Task operations. Tracing must
preserve Task results, cancellation, defect handling, and structured ownership.

## Design

- Inject a `Tracer` into the root `Run`; without one, tracing is disabled and
  does not allocate spans or read clocks.
- Add an explicit `run.trace(name, task, attributes?)` operation. Do not trace
  every Task automatically: explicit names are stable across builds and avoid
  noisy traces.
- Model each traced operation as a span. Nested traced operations inherit the
  nearest parent span, including through untraced child Runs.
- Record start and end time, safe structured attributes, and the outcome:
  success, domain error, abort, or defect. Never export arbitrary values or
  secrets by default.
- Keep the common interface backend-agnostic. Provide OpenTelemetry support as
  an adapter rather than importing its SDK into `@evolu/common`.
- Treat tracer and exporter failures as observer defects: report them without
  changing or panicking the traced Task.

## Initial Scope

- synchronous in-process context propagation through the Run tree
- configurable runtime enablement
- span names, parent-child relationships, durations, attributes, and outcomes
- deterministic tests for nesting, all exit paths, disabled tracing, and faulty
  adapters

Cross-worker context propagation, logs, metrics, sampling policies, and backend
configuration can be added separately.
