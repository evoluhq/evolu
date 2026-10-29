# SQLite comparison

This benchmark compares Evolu's own SQLite with the alternatives on Node.js, the
web and React Native. It has two purposes:

1. Numbers that anyone can reproduce, for a comparison of Evolu's SQLite with
   the SQLite libraries apps use.
2. A regression gate: Evolu replaced better-sqlite3 on Node.js, SQLite's own
   wasm on the web and expo-sqlite with SQLCipher on React Native, and nothing
   may have become slower by accident.

It compares the stacks unencrypted, so the numbers measure the SQLite build,
the binding and the file system layer, not cryptography. Evolu's encrypted
stack runs beside them, showing what its encryption costs.

## Stacks

| Platform     | Evolu                                                                        | Alternatives                                                                                                        |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Node.js      | Evolu's SQLite through `@evolu/nodejs`'s Node-API addon, plain and encrypted | better-sqlite3 13.0.3, which `@evolu/nodejs` used before; `node:sqlite` of the running Node.js                      |
| Web          | `packages/sqlite-wasm`, a `Pool` database, plain and encrypted               | `@sqlite.org/sqlite-wasm` 3.54.1-build1 with opfs-sahpool; wa-sqlite at the commit below with `AccessHandlePoolVFS` |
| React Native | `@evolu/react-native` through JSI, without and with a key                    | expo-sqlite 58.0.14 without SQLCipher; op-sqlite 19.0.2 with its defaults                                           |

Each platform's verdict compares Evolu's plain stack with the stack its
platform used before: better-sqlite3, `@sqlite.org/sqlite-wasm` and
expo-sqlite.

- The benchmark's dependencies are dev dependencies of its private package,
  [`package.json`](./package.json), and the React Native app's are
  dependencies of its own private package,
  [`react-native/app/package.json`](./react-native/app/package.json), so no
  published package depends on them. better-sqlite3 is there only as the
  Node.js reference; `@evolu/nodejs` no longer uses it. It ships its addons
  prebuilt, so its `allowBuilds` entry in `pnpm-workspace.yaml` is `false` and
  nothing compiles at install.
- Every plain stack opens its files with plain SQLite on the default unix VFS,
  Evolu's on Node.js and React Native too, whose binding opens a file without a
  key that way. Only Evolu's encrypted stacks go through Evolu's codec.
- All three React Native stacks run in one app, in one process, each on its own
  SQLite: Evolu renames every symbol of its SQLite to `evolu_`, expo-sqlite
  renames its functions to `exsqlite3_`, and op-sqlite keeps SQLite's names.
  expo-sqlite leaves three globals unrenamed, `sqlite3_version`,
  `sqlite3_temp_directory` and `sqlite3_data_directory`, which op-sqlite's
  SQLite shares on iOS, where both link into the app's binary. So there,
  op-sqlite's `sqlite_version()` reports expo-sqlite's version, and the results
  also record each stack's `sqlite_source_id()`, which tells the builds apart.
  The workloads keep temporary files in memory, so the shared directories are
  never used. On Android, each library is a shared library of its own.
- op-sqlite runs with its defaults. Its `performanceMode`, one line in
  [`react-native/app/package.json`](./react-native/app/package.json), would
  compile its SQLite with the options SQLite recommends.
- expo-sqlite with SQLCipher, what `@evolu/react-native` replaced, is a build
  option of expo-sqlite, so it can't share an app with expo-sqlite without it.
  `@evolu/react-native`'s device benchmark (`scripts/device-bench.mts`)
  compares the two encrypted builds.

## Workloads

Every stack on every platform runs the same work, each run on fresh databases.

- **wa-sqlite's 16 benchmark workloads**, the SQL files in `demo/benchmarks/` of
  a wa-sqlite clone, the workloads of SQLite's classic speed comparison, so the
  results line up with those others published. They run in order on one
  database, and the last drops the tables.
- **The driver workload**, on a database of its own: 10,000 single-row inserts
  with one prepared statement in a transaction, 10,000 point selects by primary
  key with another, and 10 reads of all 10,000 rows with a third, both in a
  read transaction. It measures the cost of each call into SQLite, in which
  the bindings differ, more than SQLite itself: Evolu's Node-API addon in C,
  better-sqlite3's through node-addon-api, Node.js's built-in binding, calls
  into wasm, JSI and Expo Modules. The reads read every column they select in
  the timed region, as an app would, so a library whose rows convert their
  values only when read, as op-sqlite's prepared statements' do, pays for it
  too.

The workloads' statements are split before the timed region, and every stack
runs each statement once with its cheapest way to run one statement: `exec` in
better-sqlite3, `node:sqlite`, `@sqlite.org/sqlite-wasm`'s `oo1` and wa-sqlite,
`execSync` in expo-sqlite and op-sqlite, and the database's `run` in Evolu's
wasm layer and in its native binding. So no stack's multi-statement API is
measured, and a binding that costs more per statement shows it in the
workloads of many statements.

The driver workload's prepared statements return rows as objects keyed by
column name in every stack. `@sqlite.org/sqlite-wasm`'s read the names once per
statement, as its `exec` with `rowMode: "object"` does, because its
`Stmt.get({})` reads them again for every row.

Every connection first runs, untimed:

```sql
PRAGMA page_size = 4096;
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
PRAGMA cache_size = -16000;
PRAGMA temp_store = MEMORY;
PRAGMA secure_delete = OFF;
```

`synchronous` FULL is SQLite's default. The 16 MB cache, `@evolu/nodejs`'s and
better-sqlite3's, holds the largest database the workloads build, 8 MiB, so no
stack spills its cache. Temporary files stay in memory, as Evolu's builds always keep
them. An encrypted connection keeps the `secure_delete` its encryption turns
on, which is part of what encryption costs. The results record each stack's
SQLite version, `PRAGMA compile_options` and its pragmas after these, and the
summary names any pragma in which the stacks differ.

## Method

- Each stack runs in its own child process on Node.js and in its own module
  worker, started by its own page, on the web. On React Native, the app runs
  every stack in its process.
- A warm-up round runs every stack once, then five measured rounds run every
  stack once each, in an order rotated by one each round, so a burst of load
  slows one run of several stacks rather than every run of one.
- Each run checks its work: `total_changes()` after every workload must equal
  what `node:sqlite` reports for the same statements in memory, the first
  warm-up run's tables must have the same checksum before the last workload
  drops them, no table may remain, the driver workload must read back what it
  wrote, a plaintext file must start with SQLite's header, and an encrypted one
  must contain neither the header nor the workloads' text and must look like
  ciphertext. Only wa-sqlite's pool can't read its files back, so its file
  isn't checked. A stack that fails is reported as failed, and the others go
  on. Once the results are written, a failed stack makes the command exit
  with 1; `docker` runs every container first.
- The summary shows each metric's median with the fastest and slowest run, and
  Evolu's time divided by the reference stack's in the same round, with the
  range. A ratio is slower when its median is above 1.1 and every round
  agrees, and faster for the inverse.
- The results record the machine, the OS, the versions of everything, and the
  load averages before and after. Close other apps before a run you publish.

The ratio, not the absolute time, is what compares. Milliseconds depend on the
machine, its load, the simulator or emulator and the browser, so they don't
carry over from one machine or run to another. Load that slows a round slows
both stacks of each pair in it, so Evolu's time divided by the reference
stack's in the same round does. For the same reason there are no baselines:
the verdict compares stacks within a run.

## Prerequisites

- The Node.js version in [`.nvmrc`](../../.nvmrc), and `pnpm install` in the
  repository root.
- A wa-sqlite clone at the commit the benchmark reads its workloads from. The
  benchmark refuses any other commit:

  ```bash
  git clone https://github.com/rhashimoto/wa-sqlite.git
  ```

  ```bash
  git -C wa-sqlite checkout 663368072ad30a4a90c36ec4214ab43d15ea2639
  ```

- Node.js: `@evolu/nodejs`'s addon for the host, which clang, make and unzip
  build:

  ```bash
  node packages/nodejs/scripts/build-native.mts
  ```

- Docker: a running Docker, such as Docker Desktop or Colima (`colima start`),
  and `@evolu/nodejs`'s addons for Linux, built as its CI builds them, on an
  arm64 host. The musl one builds in Alpine:

  ```bash
  docker run --rm -v "$PWD:$PWD" -w "$PWD" node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f sh -euc 'apk add --no-cache build-base clang unzip && node packages/nodejs/scripts/build-native.mts --target=linux-arm64-musl'
  ```

  The glibc one builds in AlmaLinux 8, for glibc 2.28, with the official
  Node.js 24.22.0 for linux-arm64 extracted in `tmp/`, a directory Docker can
  mount:

  ```bash
  docker run --rm -v "$PWD:$PWD" -v "$PWD/tmp/node-v24.22.0-linux-arm64:/opt/node:ro" -w "$PWD" almalinux:8@sha256:8b469a3a78515e8a18ea8fc727e6a3679e1d0c5ba6f58d5b30be3d0d9b86cffe sh -euc 'dnf install -y clang make unzip && export PATH=/opt/node/bin:$PATH && node packages/nodejs/scripts/build-native.mts --target=linux-arm64-gnu'
  ```

- Web: Playwright's Chromium, Firefox and WebKit, which
  `pnpm playwright:install` installs, and
  `packages/sqlite-wasm/wasm/sqlite3.wasm` from `pnpm sqlite-wasm:download` or
  a build, as its
  [README](../../packages/sqlite-wasm/README.md#the-webassembly) describes.
- iOS, on macOS: Xcode with an iOS simulator runtime, and CocoaPods.
- Android: the Android SDK with its NDK, and an emulator, which Android Studio
  installs; `ANDROID_HOME` and `JAVA_HOME` default to where it installs them
  on macOS.

## Run

One command per platform, with the clone's directory:

```bash
pnpm bench:sqlite-comparison node --wa-sqlite=../wa-sqlite
```

```bash
pnpm bench:sqlite-comparison docker --wa-sqlite=../wa-sqlite
```

```bash
pnpm bench:sqlite-comparison web --wa-sqlite=../wa-sqlite
```

```bash
pnpm bench:sqlite-comparison ios --wa-sqlite=../wa-sqlite --device="iPhone 17"
```

```bash
pnpm bench:sqlite-comparison android --wa-sqlite=../wa-sqlite
```

- `docker` runs Debian 13's glibc and then Alpine's musl, the relay image's, in
  images pinned by digest; `--libc=glibc` or `--libc=musl` selects one. Each
  container gets the checkout and the clone at their own paths and keeps its
  databases in its own file system.
- `web` runs Chromium, Firefox and WebKit, one after another; `--engine`, which
  you can repeat, selects them.
- `ios` boots the simulator named or with the UDID, or takes the booted one,
  and builds, installs and launches the app in Release with Expo. `android`
  takes the one emulator adb lists, or `--device=<serial>`, builds the app in
  Release with Gradle for the emulator's ABI, and installs and launches it with
  adb. A first build takes minutes; `--skip-build` launches the installed app.
  The app reaches the runner on the host's port 63323, the emulator through
  `adb reverse`.
- `--measured-rounds=<n>` and `--warmup-rounds=<n>` change the five measured
  rounds and the one warm-up, such as one measured round for a dry run.

## Results

Each command writes `results/<target>.json`, with every run's timings, and
`results/<target>.md`, the summary, and a second run of a target replaces its
files. `pnpm bench:sqlite-comparison report` merges every target's results,
and the relay gate's, into `results/report.md`. Git ignores `results/`.

[`results-2026-10-27/`](./results-2026-10-27/) holds a run of every target on
`0a9a95ebc`, with this benchmark's code before it was committed, so the results
name the checkout `0a9a95ebc with uncommitted changes`, and with
`@evolu/nodejs`'s addons from CI for that commit.
[`report.md`](./results-2026-10-27/report.md) merges them. The web and React
Native targets ran again later that day, with the same packages, after a review
of the harness: the `@sqlite.org/sqlite-wasm` adapter had read the column names
for every row, and it and the expo-sqlite and op-sqlite adapters had copied
every call's parameters. In Chromium's second round, `@sqlite.org/sqlite-wasm`'s
first workload took 2.4 s rather than about 1 s, which the totals without it
don't include. Both Docker targets ran twice: in glibc's first run, the VM's
disk stalled in the first workload, whose 1,000 inserts each wait for an fsync,
and in musl's, Evolu's point selects and row reads were slower and varied more,
while better-sqlite3's were steady. Evolu's row reads still vary in musl's
second run. The second runs are the targets' results, and the first are kept as
`node-linux-arm64-glibc-run1` and `node-linux-arm64-musl-run1`.

## The relay regression gate

The relay can't run its new code on better-sqlite3, as its new Storage needs
Evolu's C skiplist functions, so the gate compares the relay end to end: the
old code, better-sqlite3 and Storage's recursive CTEs, in a checkout of the
last commit before the change, against the new code in this checkout.

```bash
git worktree add ../evolu-relay-base abde2972c
```

```bash
pnpm --dir ../evolu-relay-base install --frozen-lockfile
```

```bash
pnpm bench:sqlite-comparison relay --base=../evolu-relay-base
```

`--head=<directory>` names another checkout for the new code. Each run is a
fresh process in a fresh directory, which opens `relay.db` as that checkout's
relay does, through `createRelayDeps` of its `@evolu/nodejs`. It writes 50,000
messages of 100 to 1,000 bytes in batches of 500, takes 200 fingerprints of 16
buckets, iterates every timestamp 5 times and reads 10,000 random changes, all
from a seeded generator. Rounds alternate which checkout runs first. Both
checkouts must return the same fingerprints, iterations and reads in every
run, or the gate fails. It writes `results/relay.json` and `results/relay.md`.
