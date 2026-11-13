---
"@evolu/react": minor
"@evolu/vue": minor
---

Exported UseQueryOptions and UseQueriesOptions

The options of `useQuery` and `useDeviceQuery` are now the exported `UseQueryOptions`, and those of `useQueries` and `useDeviceQueries` the exported `UseQueriesOptions`, so a helper that forwards them can name their type. They take the same `once` as before.
