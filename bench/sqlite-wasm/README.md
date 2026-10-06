# SQLite Wasm benchmark

This benchmark measures SQLite stacks in browsers on real OPFS. It compares
Evolu's own TypeScript layer in
[`packages/sqlite-wasm`](../../packages/sqlite-wasm/README.md),
`@evolu/sqlite-wasm` 2.2.4, which `@evolu/web` shipped until 3.4.1, and
[wa-sqlite](https://github.com/rhashimoto/wa-sqlite).

It runs wa-sqlite's benchmark workloads, so you can compare its results with
wa-sqlite's own. It also compares Evolu's own encryption with the one it
replaces, SQLite3 Multiple Ciphers in 2.2.4.

## Prerequisites

Use the Node.js version in [`.nvmrc`](../../.nvmrc) and install the browsers
with `pnpm playwright:install`.

Get `packages/sqlite-wasm/wasm/sqlite3.wasm`: download it with
`pnpm sqlite-wasm:download` in the repository root, or build it from source as
the [package README](../../packages/sqlite-wasm/README.md#the-webassembly)
describes.

The benchmark reads the workloads from a wa-sqlite clone and serves its
synchronous build and example VFSes. Clone wa-sqlite at the commit the
benchmark runs. The benchmark refuses any other commit:

```bash
git clone https://github.com/rhashimoto/wa-sqlite.git
git -C wa-sqlite checkout 7a4b4241ba7c61ee19121aacd6c93892234ce1a1
```

## Stacks

- `evolu`: Evolu's layer, a `Pool` database on its opfs-sahpool rewrite.
- `evoluSecureDelete`: The same with `PRAGMA secure_delete=ON`. Evolu's
  encryption and SQLite3 Multiple Ciphers set it on encrypted connections, so
  this stack separates the cost of the cipher from the cost of `secure_delete`.
- `evoluEncryptedWasm`: Evolu's layer, encrypted as Evolu does it, with
  `createEncryptedSqliteDatabase` and a raw key. The pool then encrypts in the
  format of SQLite3 Multiple Ciphers' `sqlcipher` scheme. It uses the
  WebAssembly backend of `@awasm/noble`, the pool's default.
- `evoluEncryptedNoble`: The same with `@awasm/noble`'s noble backend, which
  wraps the audited `@noble/ciphers` and `@noble/hashes`.
- `waSqliteAccessHandlePool`: wa-sqlite's synchronous build with
  `AccessHandlePoolVFS`, the design opfs-sahpool follows.
- `waSqliteCoopSync`: wa-sqlite's synchronous build with `OPFSCoopSyncVFS`, one
  OPFS file per SQLite file.
- `sqliteWasm224`: `@evolu/sqlite-wasm` 2.2.4, SQLite's own JavaScript with
  opfs-sahpool, opened as `@evolu/web` 3.4.1 opens it.
- `sqliteWasm224Sqlite3mc`: The same, encrypted as `@evolu/web` 3.0.0 to 3.4.1
  encrypt it. It uses the `multipleciphers-` wrapper of the pool's VFS,
  `PRAGMA cipher = 'sqlcipher'` and `PRAGMA key = "x'<hex>'"`. SQLite3 Multiple
  Ciphers 2.2.4 takes that key as a passphrase. This stack is the reference for
  Evolu's encryption.

To add a stack, write a worker module in [`stacks/`](./stacks) that passes a
`BenchStack` to `serveBenchStack` from [`worker.mts`](./worker.mts), or reuse
an existing one with new options or `connectionSql`. Then add the stack to
`createStackDefinitions` in [`benchmark.mts`](./benchmark.mts). Its id keys its
results and baselines. Mark it `encrypted` and the benchmark checks that its
file is ciphertext. Its worker module must then read the file as stored.

## Workload

The workloads are wa-sqlite's 16 benchmark SQL files in `demo/benchmarks/` of
the clone. They are the workloads of SQLite's classic speed comparison: inserts
with and without a transaction and an index, selects with and without an index,
updates, deletes, and dropping the tables.

A run executes the preamble `PRAGMA journal_mode=delete;`, the default of
wa-sqlite's benchmark page, and then all 16 workloads in order on one fresh
database. A stack's `connectionSql`, such as a variant's pragma, runs before
the preamble.

Each stack executes each file with a multi-statement API that steps every
statement to completion and discards rows. Evolu's layer uses `exec`, wa-sqlite
`sqlite3.exec`, and 2.2.4 the C API's `sqlite3_exec`.

For 2.2.4, `oo1.DB.exec` would add a cost that `@evolu/web` 3.4.1 pays only on
short SQL, where it is negligible. It passes SQLite the remaining SQL's length
without its terminating NUL, so SQLite copies all the remaining SQL before
preparing each statement. In workload 2, that is up to 2 MB for each of its
25000 statements.

## What differs between stacks

Every stack uses `journal_mode` DELETE, `synchronous` FULL, `locking_mode`
NORMAL and no `auto_vacuum`. Still, they do not write and flush the same.

- Flushes per commit differ between VFSes. A transaction that inserts one row
  flushes 3 times with `OPFSCoopSyncVFS`, which truncates the journal rather
  than deleting it. It flushes 5 times with Evolu's pool and 6 times with
  opfs-sahpool in 2.2.4 and `AccessHandlePoolVFS`. Evolu's pool, opfs-sahpool
  and `AccessHandlePoolVFS` all flush the journal's slot when the journal is
  created and deleted, and the last two also flush the journal when SQLite
  closes it. When it creates a journal, Evolu's pool flushes the slot before
  writing its header, so the slot's earlier truncate reaches the disk first.
  Workload 1 commits 1001 times, a CREATE TABLE and then 1000 INSERTs, so it
  mostly measures these flushes and dominates the totals. That is why the
  results also show it alone and the totals without it.
- Evolu's binary and 2.2.4's are SQLite's own wasm build. It defaults to
  8192-byte pages, a 16 MiB cache (`cache_size` -16384) and temporary files in
  memory. Evolu's binary always keeps temporary files in memory
  (`TEMP_STORE=3`). In 2.2.4's binary, they stay in memory unless a connection
  asks for files (`TEMP_STORE=2`). As the compile options in the results show,
  Evolu's binary is SQLite's bare-bones configuration and 2.2.4's is its
  full-featured one.
- wa-sqlite keeps SQLite's defaults: 4096-byte pages, about 2 MB of cache
  (`cache_size` -2000) and temporary files on disk (`TEMP_STORE=1`). Its
  smaller cache spills during workloads 3, 11, 12 and 14, so they flush more,
  and workload 12 writes 13.7 MiB rather than 8.0 MiB. `PRAGMA temp_store`
  reports 0 for every stack, which means the build's default.
- Evolu's encryption and SQLite3 Multiple Ciphers turn `secure_delete` on for
  an encrypted connection. Their deletes overwrite freed pages, and every
  overwritten page is encrypted.
- The SQLite versions differ. The results record them.

## Metrics

The benchmark serves the workers with Vite and drives Chromium, Firefox and
WebKit with Playwright. It runs one engine at a time. Each gets a fresh
persistent context, which WebKit needs for OPFS sync access handles.

Every stack runs in a dedicated module worker, started by a separate page, in a
separate directory on the engine's real OPFS. The benchmark clears OPFS before
and after each engine. With the workers of every stack on one page, ten at the
time, WebKit 26.6 ran the CPU-bound workloads of the two stacks opened last 20%
to 50% slower, whichever they were.

The server sends cross-origin isolation headers, so `performance.now()` steps
by microseconds rather than by 0.1 ms in Chromium and 1 ms in Firefox and
WebKit. A stack fails if its worker is not isolated. When cross-origin
isolated, 2.2.4 also installs its "opfs" VFS. The benchmark does not use it.

Each stack makes one warm-up run and five measured runs, each on a fresh
database that is deleted afterward. The measured runs go round the stacks in a
rotating order. A burst of machine load then slows one run of several stacks
rather than all runs of one.

The worker times each workload with `performance.now()` around the `exec` call
only. Opening, checking and deleting the database are not timed. It also counts
the flushes and written bytes each workload asks of OPFS by wrapping `flush`
and `write` of `FileSystemSyncAccessHandle`.

The results show each workload's median over the measured runs, with the
fastest and slowest run. They show the same for the total of a run and for the
total without workload 1.

A table relates each stack to `evolu`. It shows the median over runs of the
stack's total divided by Evolu's total in the same round. That cancels most of
the load that slows both, so compare stacks, such as an encryption against
plain Evolu, by these ratios rather than across runs.

Other load on the machine slows every stack, by tens of percent in WebKit. A
median does not filter out load that lasts the whole run. Close other apps
before a run you compare or record. The results include the machine's load
averages before and after each engine.

After each workload, outside the timed region, the worker reads
`total_changes()`. It must equal what better-sqlite3 reports for the same
workload in Node.js. In the warm-up run, the worker also checksums the three
tables before the last workload drops them. After each run, no table may
remain.

Then the worker reads the closed database's whole file as stored, where the
stack can. `AccessHandlePoolVFS` files cannot be read. A plaintext file must
start with SQLite's header. An encrypted file must not contain the header
anywhere, nor the workloads' text, and it must contain fewer than 1% zero
bytes. In ciphertext, about 1/256 of the bytes are zeros. In a plaintext file
it is several percent, and a file zeroed by `secure_delete` is almost only
zeros.

A stack that fails any of this, or throws, is reported as failed, and the
others go on.

## Run

```bash
pnpm bench:sqlite-wasm --wa-sqlite=../wa-sqlite
```

A run of all three engines takes about six minutes on an Apple M5. Select
engines with `--engine`, which you can repeat:

```bash
pnpm bench:sqlite-wasm --wa-sqlite=../wa-sqlite --engine=chromium
```

Every run writes two files. `results/results.json` holds the stack
definitions, every run's durations and OPFS writes, the recorded pragmas and
compile options, the browser versions and the machine. `results/results.md`
holds the tables, the OPFS writes per workload, the pragmas and the compile
options that differ between builds. Results are not committed, but the
baselines are.

## Baselines

Results are compared with [`baselines.json`](./baselines.json). It has an entry
per engine, and each entry has a baseline per stack. An engine's entry matches
when the platform, architecture, CPU model, engine, browser version, run counts
and the SHA-256 of the workload are the same. A stack's baseline matches when
its worker module, options, `connectionSql`, build and revision are the same.

The build is the SHA-256 of Evolu's binary, the wa-sqlite commit or the 2.2.4
version. So a new Evolu binary leaves the other stacks' baselines valid. Bump a
stack's `revision` when its worker module changes what it measures.

A median regresses when it is more than 30% and more than 5 ms slower than its
baseline. On an Apple M5 in use, medians of runs minutes apart differed by up
to 25% for a stack's total and 40% for a single workload, so the guard catches
large regressions only. Record baselines on a quiet machine.

The command fails if any stack failed, a median regressed, or a selected engine
or stack has no baseline. Add or update the baselines with a complete run:

```bash
pnpm bench:sqlite-wasm --wa-sqlite=../wa-sqlite --mode=update-baseline
```

Use the forced mode only for a regression you understand and intend:

```bash
pnpm bench:sqlite-wasm --wa-sqlite=../wa-sqlite --mode=force-update-baseline
```

A filtered run compares but cannot update. A new stack, build, definition or
browser matches no baseline, so update the baselines in the same change.
