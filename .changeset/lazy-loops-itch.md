---
"@evolu/react-native": patch
---

Reported a crashed shared worker in evoluError

In React Native, a panic of Evolu's in-process shared worker reached only
`ErrorUtils`, so `evoluError` stayed `null` and the app could not tell the user.
The panic now also sets `evoluError` to an `UnknownError` of its defect, as on
the web. The failed worker also ignores later messages, as a closed web
SharedWorker does, so creating another Evolu instance afterwards no longer
throws a fatal "Cannot use a disposed object." error.
