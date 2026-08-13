---
"@evolu/common": major
---

Replaced inherited Task concurrency with collection options

Removed `concurrently` and `Run.concurrency`. Added a `concurrency` option to `all`, `allSettled`, `any`, `firstN`, `firstNSettled`, and `each`. Each helper defaulted to running one Task at a time, while `race` continued to run every Task concurrently.
