---
"@evolu/oxlint-config": minor
---

Added a globalThis qualification rule

Added an Evolu-owned Oxlint rule that rejects `globalThis` qualification when
the global name does not conflict with a local or exported API. Optional global
checks and intentional global mutations remain allowed. The rule is available
for projects to enable after migrating their existing qualifications.
