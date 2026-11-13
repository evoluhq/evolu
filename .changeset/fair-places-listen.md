---
"@evolu/common": patch
---

Rejected another AppOwner in useOwner and mutations

An AppOwner's data lives only in its own database. An instance could sync another AppOwner with `useOwner`, or write its rows with a mutation's `owner`, and those rows then outlived the deletion of that AppOwner's database, which can't reach them, while `deleteOwner` takes no AppOwner. An instance now throws when `useOwner` or a mutation's `owner` names an AppOwner other than its own, and still syncs and writes its own. An instance of `createEvolu` recognizes another AppOwner by its type, so it misses an owner with another AppOwner's ID but another type, such as one created from that AppOwner's secret. An instance of `createEvoluApp` also checks the IDs of the AppOwners the app lists.

To migrate, open each AppOwner in its own instance, with `createEvolu` and that AppOwner as its `appOwner`, or with `createEvoluApp`, which opens one per AppOwner. Data that several AppOwners share gets an owner of its own, such as a `ShardOwner` or `SharedOwner`. Rows already written under another AppOwner's ID stay in this database until it is deleted with `deleteDatabase`.
