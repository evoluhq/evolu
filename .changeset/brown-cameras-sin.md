---
"evolu": minor
---

Schemaless DB schema

Evolu automatically updates the DB schema on NoSuchTableOrColumnError when applying CRDT messages. It's for a situation when an obsolete client receives messages from a newer one.

Data are safely stored but only rendered once the obsolete client is updated.
