---
"@evolu/common": major
---

Redesigned Console with structured logging and pluggable outputs

**Breaking changes:**

- Replaced `enabled` property with `ConsoleLevel` filtering (trace < debug < log < info < warn < error < silent)
- Removed `enableLogging` config option - use `level` instead
- Removed `createConsoleWithTime` - use `createConsoleEntryFormatter` with `formatEntry` option
- Removed `assert` method
- Changed `TestConsole.getLogsSnapshot()` to `getEntriesSnapshot()` returning `ConsoleEntry` objects
- Changed `TestConsole.clearLogs()` to `clearEntries()`

**New features:**

- Structured `ConsoleEntry` objects with method, path, and args
- Pluggable `ConsoleOutput` interface for custom destinations (file, network, array)
- `Console.child(name)` creates derived consoles with path prefixes
- `children: ReadonlySet<Console>` tracks child consoles for batch operations
- `name` property identifies consoles
- `getLevel()`, `setLevel(level | null)`, `hasOwnLevel()` for runtime level control
- `createConsoleEntryFormatter` for timestamps (relative, absolute, iso) and path prefixes
- `createNativeConsoleOutput` and `createConsoleArrayOutput` built-in outputs
- Static level inheritance - children inherit parent's level at creation, then are independent
