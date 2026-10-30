# CI compares benchmark timings with an explicit anchor on one runner

- Date: 2026-10-30
- Status: Accepted

## Context

The timing suites in [`bench`](../../bench/README.md), protocol runtime,
storage, Type runtime, JSON codec and SQLite Wasm, compare each run with a
committed baseline that matches one exact environment, including the CPU model
and the Node.js version, or the browser version for SQLite Wasm. The baselines
come from the maintainer's Mac. GitHub documents no CPU model for its hosted
Linux runners, which land on different CPUs from job to job, so no baseline
would match there. CI therefore ran only `bench:type` and `bench:protocol`,
which count deterministic work, such as compiler work, rounds, bytes and SQL
statements, that no machine changes. Constant factors, such as the speed of the
C skiplist, the codec or Type validation, were checked only when someone ran a
timing suite locally, which nothing enforced, so a regression or a slow drift
could reach a release unnoticed.

Six jobs on hosted x64 Linux runners ran protocol runtime's base comparison of
a commit with itself. They landed on three CPU models, AMD EPYC 7763, 9V74 and
9V45, and the same comparison took 9 to 14 minutes, so absolute timings are not
comparable between jobs. The median ratios of metrics of 20 ms or more stayed
within 8.5% of 1, half of them within 1.2%, and none was more than 5% slower
with every pair slower. Shorter metrics were noisy, and the shortest read 0 ms:
Linux reads a running thread's own CPU time only as of the scheduler's last
accounting
([cputime.c](https://github.com/torvalds/linux/blob/v6.8/kernel/sched/cputime.c#L630-L639)),
so a region shorter than a few scheduler ticks reads too little, while the
process's CPU time adds the running thread's pending time
([cputime.c](https://github.com/torvalds/linux/blob/v6.8/kernel/sched/cputime.c#L320-L329)).

Running two versions in one job cancels the machine but not all noise: in a
16-day experiment, interleaved runs of identical code had ratios with a
standard deviation of 0.05, ranging from 0.51 to 1.36
([Quansight](https://labs.quansight.org/blog/github-actions-benchmarks)).
Hosted Linux runners give no access to hardware performance counters
([runner-images#4974](https://github.com/actions/runner-images/issues/4974)).

The repository already compared two versions on one machine.
`bench:protocol-runtime --base=<ref>` runs ABBA pairs of child processes and
gates the median of their CPU time ratios
([Comparing with another commit](../../bench/protocol-runtime/README.md#comparing-with-another-commit)).
The SQLite comparison's relay gate runs two checkouts, each with its own
install
([The relay regression gate](../../bench/sqlite-comparison/README.md#the-relay-regression-gate)).
Cost tests compare with a baseline measured in the same run
([Cost tests](../../test/README.md#cost-tests)).

## Decision

Absolute timings stay local. Each timing suite keeps its exact-environment
baselines and its gate, and the maintainer records them as before.

CI checks protocol runtime and storage relatively. For each, a job on a hosted
Linux runner compares the head with the suite's anchor: the last commit that
changed `bench/<suite>/ci-anchor.txt`, a one-line file that says why the anchor
last moved. The ratio therefore measures the drift since the maintainer last
accepted the suite's timings in CI, for a pull request, a merge group and a
push to main alike. Type runtime and JSON codec time single operations, whose
regressions matter where an end-to-end workload shows them, so they stay local.

Moving the anchor is the only way to accept timings in CI, as
`--mode=force-update-baseline` is locally. Recording local baselines does not
move it: a recording on the maintainer's Mac says nothing about Linux, and
`--mode=update-baseline` writes a baseline for a new environment, such as a new
Node.js version, without comparing it with the old one.

- The job checks the anchor out in a Git worktree with its own
  `pnpm install --frozen-lockfile`, so dependency updates are part of what it
  measures. The suite's `--base-checkout=<dir>` runs each side's own benchmark
  code with the runner's one Node.js binary, and each side builds its own
  SQLite addon.
- Protocol runtime runs five pairs of child processes per case, in alternating
  order, timed with CPU time: the measuring thread's, except on Linux, where it
  is the process's, which also counts V8's helper threads. Storage runs five
  pairs of whole benchmark processes, timed with wall time as its local runs
  are. A comparison refuses an anchor whose harness differs, protocol runtime's
  harness modules or storage's `measure.mts`, or whose protocol runtime cases
  differ, and protocol runtime fails a case whose workload differs, as the two
  are not comparable.
- A metric regresses when the median of its paired ratios exceeds the
  threshold and every pair is slower, as the relay gate decides. The threshold
  in CI starts at 20%.
- When the commits a run checks move an anchor, the job compares the head with
  the previous anchor instead and reports without gating, so the job summary
  shows what the move accepted, or, when the move came with a harness or
  workload change, that the two are not comparable.
- The job writes its report to the job summary. It starts in a workflow of its
  own, outside the checks that gate pull requests and releases. Its runs
  measure the spread on hosted runners and set the threshold; then it joins the
  checks, and a regression, an anchor that cannot run, or a suite that is not
  comparable fails them until a commit moves the suite's anchor.

SQLite Wasm and the SQLite comparison stay local. SQLite Wasm needs browsers
and a wasm build per side, and on a Mac in use, medians of its runs minutes
apart already differ by up to 25% in a stack's total and 40% in a single
workload. The SQLite comparison measures Evolu against other libraries, not
against an earlier commit, and its web and React Native targets need browsers
or devices.

## Rejected alternatives

- Baselines or a result history for CI runners: the CPU model changes between
  jobs, and thresholds over a history carry the variance between machines.
- Anchoring to the last commit that changed a suite's `baselines.json`: every
  local recording would accept the drift CI measured without anyone seeing it,
  including a recording on a Mac, which says nothing about Linux, and one that
  adds an environment without comparing it with the old one.
- Comparing with the pull request's base or the previous push: each change is
  measured alone, so ten pushes that are each 5% slower pass a 20% threshold
  while the code gets 63% slower. Most changes also reach main by a direct
  push, not through a pull request.
- Comparing with the last release: packages are versioned and tagged
  separately, and each release tags only the packages it changed, so each
  package's last release can be a different commit.
- The protocol benchmarks' snapshot, which reuses the head's install: it
  refuses a base whose `pnpm-lock.yaml` differs, as most anchors' would, and it
  runs the head's harness on the base's code, which needs shims as the API
  changes.
- Counting instructions under Valgrind, as SQLite and CodSpeed do: it is
  deterministic, but Valgrind does not run on arm64 macOS, and in its Valgrind
  mode CodSpeed runs Node.js with V8's optimizing compilers, Turbofan and
  Maglev, disabled
  ([introspection.ts](https://github.com/CodSpeedHQ/codspeed-node/blob/v6.1.0/packages/core/src/introspection.ts)),
  so it measures code that production does not run.
- Hardware performance counters: hosted Linux runners do not expose them.
- A dedicated or self-hosted runner, which would allow absolute baselines in
  CI: GitHub advises against self-hosted runners for public repositories
  ([Secure use](https://docs.github.com/en/actions/reference/security/secure-use)),
  and a hosted benchmark runner adds a vendor.
- Dividing timings by a calibration workload: the calibrator has noise of its
  own, and one score cannot follow how differently machines run the JIT, the
  garbage collector, memory and SQLite.

## Consequences

CI decides only by the paired ratios. The timings it prints beside them
describe one hosted runner and serve only to read the ratios; the absolute
numbers and their history stay in the local baselines. A failure says the head
is slower than the anchor, not which change made it slower; the job history on
main, or a local comparison with `--base` or `--base-checkout`, finds the
change. A regression, a harness change or an anchor that no longer runs keeps
failing until a commit moves the anchor, and only a move locks in an
improvement: after a change cuts a time by 30%, a later change that raises it
by 60% still passes a 20% threshold. Regressions below the threshold pass CI
and need the local gate. Local baselines and the anchor move separately, so
they can describe different commits.

A change to a suite's harness or workload also moves its anchor, in the same
commit. On Linux, protocol runtime's CPU time includes V8's helper threads,
unlike the Mac's; both sides of a comparison use the same clock, so its ratios
stay comparable. The measurements above used thread CPU time, so the workflow's
first runs measure the spread with process CPU time anew.

Each run doubles the measurement and adds a second install and addon build.
Protocol runtime's comparison takes 9 to 14 minutes on a hosted runner,
depending on the CPU it lands on, mostly in SQLite passes that never gate but
check that its in-memory storage behaves like SQLite.

CI times only x64 Linux; arm64 and macOS stay covered by local runs only.

Revisit if the workflow's runs show that hosted runners need a threshold so
wide that the regressions worth catching pass, such as above 30%. Then a
dedicated runner for the timing suites, or instruction counts for the C core
alone, would be worth its cost.
