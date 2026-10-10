---
"@evolu/nodejs": minor
---

Added TSX example support to testJSDocExamples

`testJSDocExamples` now tests `tsx` fences, which it skipped before. They are
compiled with the automatic React JSX runtime, linted, and run after Vite
transforms their JSX, because Node.js cannot strip JSX. Projects with TSX
examples need `vite`, `react`, and `@types/react` installed.
