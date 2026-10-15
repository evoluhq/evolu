---
"@evolu/oxlint-config": patch
---

Updated eslint-plugin-jsdoc to 65.3.4

Its `no-undefined-types` rule, the one the shared config enables, parsed every JSDoc comment of a file again for each comment it checked, so linting time grew quadratically with a file's comments. It now parses them once per file. Linting the Evolu repository takes about half the time, with the same results.
