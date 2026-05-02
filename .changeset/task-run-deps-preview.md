---
"@evolu/common": minor
"@evolu/nodejs": patch
"@evolu/react-native": patch
"@evolu/web": patch
---

Updated Task and Run dependency injection API.

Removed `Run.addDeps` because every `Run` now owns its deps. The new API is more flexible and better matches sync Pure DI: deps are passed explicitly where a task is called, can replace existing deps when needed, and can be scoped to an owned disposable `Run` with `run.create(deps)`.

- Renamed `RunDeps` to `RunDefaultDeps` to describe default Run dependencies more clearly.
- Replaced `Run.addDeps` with explicit dependency passing via `run(task, deps)`, `run.orThrow(task, deps)`, and `run.create(deps)`.
- Allowed explicit deps to override default `RunDefaultDeps` when needed.
