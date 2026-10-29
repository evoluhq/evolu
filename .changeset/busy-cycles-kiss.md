---
"@evolu/react-native": patch
---

Made the React Native binding clean up when memory runs out while it opens or exports a database

If an allocation failed at one point of an open or an export, which a device practically never hits, the database could stay open until the app restarted, or the export's unencrypted copy could stay in memory unwiped. Both now clean up, as in `@evolu/nodejs`.
