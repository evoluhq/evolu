---
"@evolu/nodejs": minor
---

Added production bundle testing utilities.

The new `@evolu/nodejs/TestBundle` entry point bundles named cases with every
supported bundler and records their raw and Brotli-compressed sizes together
with the bundler names and versions. The returned record is ready for inline
size snapshots. Assertions run outside the measured bundles, so test code does
not affect size results. All case and bundler jobs share one concurrent Evolu
Task pool bounded by the CPU parallelism available to the process.

Each emitted bundle is executed in an isolated worker. Evaluation errors,
rejected results, unhandled rejections, early exits, and timeouts fail the test,
ensuring that size and tree-shaking assertions describe code that actually
runs. Bundle production also runs in isolated workers with its own timeout, so
a stuck bundler cannot hang the test process. Failures from multiple jobs are
reported together with their case and bundler names.
