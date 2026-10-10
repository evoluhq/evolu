---
"@evolu/react-native": patch
---

Reported crashes of Evolu's in-process workers with their error

In React Native, Evolu's database worker and shared worker run in the app's
JavaScript runtime, each with its own root `Run`. These `Run`s reported a panic
by throwing its `AbortError`, a plain object, from a microtask, so when a
database failed to open, React Native showed a fatal "Uncaught Error" without
the error's message. They now use the React Native `createRun`, which reports
the panic's defect with `ErrorUtils.reportError`, as the app's own `Run` has
done since 16.0.3.

The panic is now a non-fatal error, as it is for the app's own `Run`: React
Native shows it in development and logs it in a release build, which keeps
running.
