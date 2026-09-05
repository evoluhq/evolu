---
"@evolu/nodejs": patch
---

Fixed type resolution in documentation examples

`testJSDocExamples` now applies package aliases when type-checking imports
within aliased modules. Examples can use branded types across common and
platform packages without mixing source and built declarations.
