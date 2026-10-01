import { test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertType,
  createEvolu,
  createQueryBuilder,
  type Evolu,
  NonEmptyTrimmedString100,
  object,
  type OwnerIdBytes,
  ownerIdToOwnerIdBytes,
  sqliteQueryStringToSqliteQuery,
  type Task,
  testAppName,
  testAppOwner,
  type TestEvoluSchema,
  testEvoluSchema,
  testLocalOnlyEvoluSchema,
  testOwnerSecret,
  TestProjectId,
  testProjectId,
  TestTodoId,
  testTodoId,
  type TimestampBytes,
} from "../index.ts";
import type { EvoluPlatformDeps } from "./Evolu.ts";
import { evoluSchemaToSqliteSchema, type ValidateSchema } from "./Schema.ts";

test("history queries select and filter by ownerId bytes", () => {
  const createQuery = createQueryBuilder(testEvoluSchema);
  const query = createQuery((db) =>
    db
      .selectFrom("evolu_history")
      .select(["ownerId", "timestamp"])
      .where("ownerId", "=", ownerIdToOwnerIdBytes(testAppOwner.id)),
  );

  assertType<
    typeof query.Row,
    { ownerId: OwnerIdBytes; timestamp: TimestampBytes }
  >();
});

test("evoluSchemaToSqliteSchema compiles ordinary indexes", () => {
  const sqliteSchema = evoluSchemaToSqliteSchema(testEvoluSchema, (create) => [
    create("todoTitle").on("todo").column("title"),
    create("todoProjectIdTitle").on("todo").columns(["projectId", "title"]),
    create("todoTitleNotNull")
      .on("todo")
      .column("title")
      .where("title", "is not", null),
  ]);

  assertEqual(sqliteSchema.indexes, [
    {
      name: "todoTitle",
      sql: 'create index "todoTitle" on "todo" ("title")',
    },
    {
      name: "todoProjectIdTitle",
      sql: 'create index "todoProjectIdTitle" on "todo" ("projectId", "title")',
    },
    {
      name: "todoTitleNotNull",
      sql: 'create index "todoTitleNotNull" on "todo" ("title") where "title" is not null',
    },
  ]);
});

test("evoluSchemaToSqliteSchema rejects unique indexes", () => {
  const error = assertThrowsInstanceOf(
    () =>
      evoluSchemaToSqliteSchema(testEvoluSchema, (create) => [
        create("todoUniqueTitle").on("todo").column("title").unique(),
      ]),
    Error,
  );

  assertEqual(
    error.message,
    "Unique indexes are not supported because they can prevent synchronization.",
  );
});

test("evoluSchemaToSqliteSchema rejects composite unique indexes", () => {
  const error = assertThrowsInstanceOf(
    () =>
      evoluSchemaToSqliteSchema(testEvoluSchema, (create) => [
        create("todoUniqueProjectIdTitle")
          .on("todo")
          .columns(["projectId", "title"])
          .unique(),
      ]),
    Error,
  );

  assertEqual(
    error.message,
    "Unique indexes are not supported because they can prevent synchronization.",
  );
});

test("evoluSchemaToSqliteSchema rejects partial unique indexes", () => {
  const error = assertThrowsInstanceOf(
    () =>
      evoluSchemaToSqliteSchema(testEvoluSchema, (create) => [
        create("todoUniqueTitleNotNull")
          .on("todo")
          .column("title")
          .where("title", "is not", null)
          .unique(),
      ]),
    Error,
  );

  assertEqual(
    error.message,
    "Unique indexes are not supported because they can prevent synchronization.",
  );
});

test("testEvoluSchema supports project-linked and independent todos", () => {
  assertType<TestEvoluSchema, typeof testEvoluSchema>();
  assertType<ValidateSchema<TestEvoluSchema>, TestEvoluSchema>();
  assertType<typeof testTodoId, TestTodoId>();
  assertType<typeof testProjectId, TestProjectId>();
  assertSame(testEvoluSchema.todo.id, TestTodoId);
  assertSame(testEvoluSchema.project.id, TestProjectId);
  assertEqual(new Set<string>([testTodoId, testProjectId]).size, 2);
  const Todo = object(testEvoluSchema.todo);
  const todo = {
    id: testTodoId,
    title: "Write documentation",
    isCompleted: null,
    projectId: testProjectId,
  };
  assertOk(Todo.fromUnknown(todo), todo);
  const independentTodo = { ...todo, projectId: null };
  assertOk(Todo.fromUnknown(independentTodo), independentTodo);
  assertOk(testEvoluSchema.todo.projectId.from(testProjectId), testProjectId);
  void (() => {
    // @ts-expect-error A todo ID is not a project ID.
    testEvoluSchema.todo.projectId.from(testTodoId);
  });

  const createQuery = createQueryBuilder(testEvoluSchema);
  const query = createQuery((db) =>
    db
      .selectFrom("todo")
      .leftJoin("project", "project.id", "todo.projectId")
      .select(["todo.title", "project.name as projectName"]),
  );
  assertType<
    typeof query.Row,
    {
      title: NonEmptyTrimmedString100 | null;
      projectName: NonEmptyTrimmedString100 | null;
    }
  >();
  assertEqual(
    sqliteQueryStringToSqliteQuery(query).sql,
    'select "todo"."title", "project"."name" as "projectName" from "todo" left join "project" on "project"."id" = "todo"."projectId"',
  );

  const createTodos = createEvolu(testEvoluSchema, {
    appName: testAppName,
    appOwner: testAppOwner,
    transports: [],
  });
  assertType<
    typeof createTodos,
    Task<Evolu<TestEvoluSchema>, never, EvoluPlatformDeps>
  >();
});

test("testLocalOnlyEvoluSchema supports keys with or without recovery material", () => {
  assertType<
    ValidateSchema<typeof testLocalOnlyEvoluSchema>,
    typeof testLocalOnlyEvoluSchema
  >();
  const AppOwnerRow = object(testLocalOnlyEvoluSchema._appOwner);
  const recoverableOwner = {
    id: testAppOwner.id,
    encryptionKey: testAppOwner.encryptionKey,
    writeKey: testAppOwner.writeKey,
    secret: testOwnerSecret,
    name: "Personal",
  };
  assertOk(AppOwnerRow.fromUnknown(recoverableOwner), recoverableOwner);
  const keyOnlyOwner = {
    ...recoverableOwner,
    secret: null,
    name: null,
  };
  assertOk(AppOwnerRow.fromUnknown(keyOnlyOwner), keyOnlyOwner);
  assertErr(
    AppOwnerRow.fromUnknown({
      ...keyOnlyOwner,
      encryptionKey: new Uint8Array(1),
    }),
  );
  assertErr(
    AppOwnerRow.fromUnknown({
      ...recoverableOwner,
      secret: new Uint8Array(1),
    }),
  );

  const createAccounts = createEvolu(testLocalOnlyEvoluSchema, {
    appName: testAppName,
    appOwner: testAppOwner,
    transports: [],
  });
  assertType<
    typeof createAccounts,
    Task<Evolu<typeof testLocalOnlyEvoluSchema>, never, EvoluPlatformDeps>
  >();
});
