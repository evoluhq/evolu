# The database caches prepared statements, by template where SQL runs and by text where it arrives as data

- Date: 2026-10-24
- Status: Accepted

## Context

Evolu builds SQL with the `sql` tagged template and runs it with
`Sqlite.exec`. Each driver kept compiled statements in
`createPreparedStatementsCache`, a map keyed by SQL text: better-sqlite3 kept
every query, and the web driver and React Native's native driver kept queries
with the `prepare` option, which `sql.prepared` set.

Evolu's own statements are built and run in the same realm, the DbWorker or the
relay, and building their text took a measurable share of the CPU. When a fresh
client downloaded 20,000 todos from a relay (Node.js 24, better-sqlite3, an
Apple silicon MacBook Air, medians of seven interleaved runs), building each
statement's text and hashing it for the map took about 14% of the client's CPU:
1,365 ms with those caches and 1,171 ms with the one this ADR describes. V8
caches a string's hash in the string, but a string built for each call has to be
flattened, hashed, and compared in full, so the cost grows with the text, such
as the 2,400-character skiplist insert.

The `prepare` option exists for another case. App queries made with
`createQuery(…, { prepare: true })` are serialized into Query strings, sent to
the DbWorker, and run there after every mutation while subscribed. Template
objects do not survive `postMessage`, so the text is the only key there, and
the generic SQLite layer cannot know which queries repeat unless the sender
says so.

## Decision

The database, not the driver, owns prepared statements. `createSqlite` keeps
them and finalizes them when it is disposed, before the driver closes. A driver
only prepares: `SqliteDriver.prepare(sql)` returns a `SqliteDriverStatement`
that runs many times, and its `exec` and `iterate` run on statements of their
own. This matches what better-sqlite3, `@evolu/sqlite-wasm`, and Evolu's
native SQLite binding for React Native expose.

Hot SQL that runs where it is written uses `Sqlite.prepared`, a tagged template
that runs the SQL on a statement keyed by the template's strings array and the
SQL of its identifier and raw fragments. The language gives a call site the
same strings array on every call, so a later call finds the statement without
building its SQL text, only a short key from the SQL of its fragments. Evolu's
hot Db, Storage, and Relay statements use it, except the streamed timestamp
read, which `Sqlite.iterate` runs on a statement of its own. `sql.prepared` is
deleted.

A query that travels as data keeps the `prepare` option, and `Sqlite.exec` runs
it on a statement kept for its SQL text.

Both caches are bounded by what callers mark: call sites times the fragments
they pass, which Evolu's schema bounds, and the texts marked `prepare`. There
is no constant and no module state.

## Rejected alternatives

- Intern the text of `sql.prepared` in a module-global map keyed by the
  template, with at most 1,000 entries per template: it is fast, but its state
  outlives every database, its limit is a policy tuned to Evolu's schema-shaped
  fragments in a package other apps use, and an app whose fragments change with
  every call only churns it.
- Key the drivers' caches by template, with `SqliteQuery.sql` either text or a
  template: a public data type gets two representations that every consumer has
  to normalize, the cache stays duplicated in every driver, and a query cloned
  as data silently misses on every run.
- Explicit statement handles, with a template whose slots are accessors and maps
  of handles held by Db.ts: a hit would skip even the short key of the
  fragments, but it adds about six public names and a second meaning of `${}`,
  and it rewrites the skiplist statements that are moving into the own SQLite
  core. Handles can still be added on top of `SqliteDriver.prepare`.
- Delete the `prepare` option: app queries run in the DbWorker could not ask for
  a kept statement, which loads 100 rows in about 40% less time than a statement
  of their own with the web's SQLite and better-sqlite3, and in about 6% less
  time with the N-API build of React Native's native binding, measured per
  statement in Node.js on in-memory databases.
- Let the DbWorker keep statements for subscribed queries without an option: it
  receives the subscribed queries with every mutation, but releasing a statement
  once no Evolu instance subscribes needs per-instance tracking.

## Consequences

Evolu's hot statements, except the streamed timestamp read, no longer build or
hash SQL text, and the statements the database keeps live until it is disposed,
on every driver.

Drivers no longer cache on their own. A query without `prepare` runs on a
statement of its own on every driver, including better-sqlite3, where a small
upsert then takes about 3.7 µs instead of 0.4 µs on a kept statement, so every
hot relay query moved to `Sqlite.prepared`. Custom drivers must implement
`prepare`.

`Sqlite.prepared` relies on the strings array of a template. A caller that
builds a new array for each call keeps a statement per call until the database
is disposed, and so does one that passes fragments from an unbounded set. Its
JSDoc says so; JavaScript engines and compilers, Babel, TypeScript, esbuild,
SWC, and Hermes among them, keep one array per call site.

Statements run with `Sqlite.prepared` bypass `Sqlite.exec`, so they do not take
the `logQueryExecutionTime` and `logExplainQueryPlan` options, and tests or
benchmarks that wrap `exec` have to wrap `prepared` too.

Revisit if a driver on Evolu's own SQLite needs statement handles held by
callers, or if the DbWorker should keep statements for subscribed queries
without the option.
