---
"@evolu/nodejs": patch
---

Restricted testJSDocExamples fences to ts and tsx

`testJSDocExamples` used to treat `typescript` fences, and fences in any
letter case such as `TS`, as TypeScript examples. It now accepts only `ts` and
`tsx`, and fails on other spellings of them, so that one language has one
spelling and no example is skipped because of how its fence is written. Rename
such fences to `ts` or `tsx`.
