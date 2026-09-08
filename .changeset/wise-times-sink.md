---
"@evolu/common": minor
---

Added reusable local-first test fixtures

Exported `testEvoluSchema`, `TestEvoluSchema`, `TestTodoId`, `TestProjectId`,
`testTodoId`, and `testProjectId` for deterministic tests and examples with
project-linked or independent todos. Also exported the existing `testAppName`
from the common entrypoint. Examples now reuse these fixtures and the existing
`testAppOwner` where schema or owner creation is not the subject.

```ts
import {
  assertOk,
  testEvoluSchema,
  testProjectId,
  testTodoId,
} from "@evolu/common";

assertOk(testEvoluSchema.todo.id.from(testTodoId), testTodoId);
assertOk(testEvoluSchema.todo.projectId.from(testProjectId), testProjectId);
```
