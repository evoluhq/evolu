---
"@evolu/common": minor
---

Removed unused Console APIs

`Console` no longer has `children`, `name`, or the `dir`, `table`, `time`,
`timeLog`, `timeEnd`, `count`, and `countReset` methods. `ConsoleConfig` no
longer has `name`, and `ConsoleMethod` has only the six level methods. The
removed methods did not survive forwarding from a worker: a tab replaying a
timer measured the gap between the replayed entries, not the timed work.

To migrate:

- Instead of setting a level on each of `children`, set it on the parent, which
  its children follow.
- Instead of `Console.name`, use the last element of an entry's `path`. Remove
  `ConsoleConfig.name`, which never appeared in entries.
- Instead of `time`, `timeLog`, and `timeEnd`, measure with
  `time.performance.now()` and log the duration. Instead of `dir`, `table`,
  `count`, and `countReset`, log the value, or your own counter, with `debug`.
