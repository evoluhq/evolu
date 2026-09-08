import {
  type AppName,
  assertType,
  createEvolu,
  type Evolu,
  type Task,
  testAppName,
  testAppOwner,
  type TestEvoluSchema,
  testEvoluSchema,
  TestProjectId,
  testProjectId,
  TestTodoId,
  testTodoId,
} from "@evolu/common";
import type { EvoluPlatformDeps } from "@evolu/common/local-first";

assertType<typeof testAppName, AppName>();
assertType<TestEvoluSchema, typeof testEvoluSchema>();
assertType<typeof testTodoId, TestTodoId>();
assertType<typeof testProjectId, TestProjectId>();
TestTodoId.from(testTodoId);
TestProjectId.from(testProjectId);

const createTodos = createEvolu(testEvoluSchema, {
  appName: testAppName,
  appOwner: testAppOwner,
  transports: [],
});
assertType<
  typeof createTodos,
  Task<Evolu<TestEvoluSchema>, never, EvoluPlatformDeps>
>();

// @ts-expect-error A todo ID is not a project ID.
testEvoluSchema.todo.projectId.from(testTodoId);
