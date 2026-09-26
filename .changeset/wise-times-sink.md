---
"@evolu/common": minor
---

Added reusable local-first test fixtures

Exported `testEvoluSchema`, `TestEvoluSchema`, `TestTodoId`, `TestProjectId`,
`testTodoId`, and `testProjectId` for deterministic tests and examples with
project-linked or independent todos, and `testLocalOnlyEvoluSchema`, which
stores app owners in a local-only `_appOwner` table with operational keys,
optional recovery secrets, and optional names. Also exported the existing
`testAppName` from the common entrypoint.

```ts
import {
  assertOk,
  createEvolu,
  testAppName,
  testAppOwner,
  testEvoluSchema,
  testLocalOnlyEvoluSchema,
  testProjectId,
  testTodoId,
} from "@evolu/common";

assertOk(testEvoluSchema.todo.id.from(testTodoId), testTodoId);
assertOk(testEvoluSchema.todo.projectId.from(testProjectId), testProjectId);

const _createAccounts = createEvolu(testLocalOnlyEvoluSchema, {
  appName: testAppName,
  appOwner: testAppOwner,
  transports: [],
});
```
