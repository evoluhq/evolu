---
"@evolu/common": minor
---

Added pull-based protocol types for modeling three-outcome operations

New types and utilities for iterators and streams where completion is a normal outcome, not an error:

- `Done<D>` - Signal type for normal completion with optional summary value
- `done(value)` - Factory function to create Done instances
- `NextResult<A, E, D>` - Result that can complete with value, error, or done
- `nextResult(ok, err, done)` - Factory for creating NextResult Type instances
- `UnknownNextResult` - Type instance for runtime `.is()` checks
- `InferDone<R>` - Extracts the done value type from a NextResult
- `NextTask<T, E, D>` - Task that can complete with value, error, or done
- `InferTaskDone<T>` - Extracts the done value type from a NextTask

The naming follows the existing pattern: `Result` → `NextResult`, `Task` → `NextTask`.
