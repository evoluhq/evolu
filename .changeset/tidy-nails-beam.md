---
"evolu": minor
---

Add String schema

String schema represents a string that is not stringified JSON. Using String schema for strings stored in SQLite is crucial to ensure a stored string is not automatically parsed to a JSON object or array when retrieved. Use String schema for all string-based schemas.
