---
"@evolu/common": patch
---

Added compile-time schema validation with clear error messages

- Added ValidateSchema type that validates Evolu schemas at compile-time and returns readable error messages instead of cryptic TypeScript errors
- Schema validation now enforces:
  - All tables must have an 'id' column
  - The 'id' column must be a branded ID type (created with id() function)
  - Tables cannot use default column names (createdAt, updatedAt, isDeleted)
  - All column types must be compatible with SQLite (extend SqliteValue)
- Enhanced developer experience with actionable error messages like "❌ Schema Error: Table 'todo' is missing required id column"
- Added test coverage for all validation scenarios
