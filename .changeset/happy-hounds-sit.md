---
"@evolu/common": patch
---

Stopped logging Evolu's lifecycle events by default

Evolu logged its own lifecycle events, such as creating and disposing an instance and its DbWorker taking the lead, at `info`, which the default console level, `log`, prints, so every app printed them. They're now at `debug`. To see them, give the deps a console at that level, such as `createEvoluDeps({ console: createConsole({ level: "debug" }) })`.
