---
"@evolu/common": patch
"@evolu/react-native": patch
"@evolu/web": patch
---

Closed a failed shared worker so the app can be opened again

When a defect stopped Evolu's shared worker, tabs opened afterwards connected
to the failed worker and never loaded their data, even after a reload while
another tab of the app stayed open. On React Native, deps created again
connected to it too. The failed worker now closes, so the next tab or deps start
a new one. Closing each open database also no longer reports an extra "Cannot
use a disposed object." defect after the original one. Each DbWorker now stops
once its shared worker ends, so a custom platform setup must give the shared
worker and its DbWorkers the same `LockManager`, as the web and React Native
setups do.

An `UnknownError` in `evoluError` leaves Evolu in an unknown state, so the app
can only ask the user to close the tab. The documentation now says so instead of
suggesting to try again.
