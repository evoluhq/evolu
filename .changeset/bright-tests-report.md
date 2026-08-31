---
"@evolu/nodejs": minor
---

Added a Node.js test overview reporter

The new `@evolu/nodejs/TestOverviewReporter` entry point lists test files slowest-first while preserving Node.js failure diagnostics, run totals, and coverage output. Durations longer than 300 ms are highlighted when terminal colors are supported.

Use it directly with Node.js:

```sh
node --test --test-reporter=@evolu/nodejs/TestOverviewReporter
```
