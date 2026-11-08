---
"@evolu/common": patch
"@evolu/web": patch
---

Notified every Store listener when one throws

A Store stopped notifying its remaining listeners when one of them threw, so a listener subscribed later, such as React's, could keep rendering the previous value. It now calls every listener and then throws the error, or an `AggregateError` of every error, in listener order, when several listeners threw. A tab also finishes connecting to its worker when an `evoluError` listener throws as the tab clears another build's `OtherBuildRunningError`. A tab also logs a worker's error before it reports it, so an `evoluError` listener that throws no longer hides it from the console.
