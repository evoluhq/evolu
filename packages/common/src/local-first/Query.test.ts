import { test } from "node:test";
import {
  assertEqual,
  assertLength,
  assertNotUndefined,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "../Assert.ts";
import { ColumnNode, type SelectQueryNode } from "kysely";

import type { Query, Row } from "./Query.ts";
import {
  applyPatches,
  evoluJsonArrayFrom,
  evoluJsonBuildObject,
  evoluJsonObjectFrom,
  getJsonObjectArgs,
  kyselyJsonIdentifier,
  kyselySql,
  makePatches,
} from "./Query.ts";
import { createQueryBuilder } from "./Schema.ts";
import { sqliteQueryStringToSqliteQuery } from "../Sqlite.ts";
import { assertType, id, NonEmptyTrimmedString100 } from "../Type.ts";

const PersonId = id("Person");
const PetId = id("Pet");

const QuerySchema = {
  person: {
    id: PersonId,
    name: NonEmptyTrimmedString100,
  },
  pet: {
    id: PetId,
    name: NonEmptyTrimmedString100,
    ownerId: PersonId,
  },
};

const createQuery = createQueryBuilder(QuerySchema);

const NoteId = id("Note");
const AnotherQuerySchema = {
  note: {
    id: NoteId,
    title: NonEmptyTrimmedString100,
  },
};

const createAnotherQuery = createQueryBuilder(AnotherQuerySchema);

test("Query", () => {
  const query1 = createQuery((db) =>
    db.selectFrom("person").select(["id", "name"]),
  );
  const query2 = createAnotherQuery((db) =>
    db.selectFrom("note").select(["id", "title"]),
  );

  // Ensure queries from different schemas are not assignable.
  // @ts-expect-error - query1 should not be assignable to query2
  const shouldError: typeof query2 = query1;

  // @ts-expect-error - query2 should not be assignable to query1
  const shouldAlsoError: typeof query1 = query2;

  assertType<
    typeof query1 extends Query<typeof QuerySchema> ? true : false,
    true
  >();
});

test("evoluJsonArrayFrom compiles a prefixed SQLite JSON array query", () => {
  const query = createQuery((db) =>
    db
      .selectFrom("person")
      .select(["person.id"])
      .select((eb) => [
        evoluJsonArrayFrom(
          eb
            .selectFrom("pet")
            .select(["pet.id as petId", "pet.name", "ownerId"])
            .whereRef("pet.ownerId", "=", "person.id"),
        ).as("pets"),
      ]),
  );

  const sqlQuery = sqliteQueryStringToSqliteQuery(query);

  assertTrue(sqlQuery.sql.includes("json_group_array(json_object("));
  assertTrue(sqlQuery.sql.includes(kyselyJsonIdentifier));
  assertTrue(sqlQuery.sql.includes('"agg"."petId"'));
  assertTrue(sqlQuery.sql.includes('"agg"."name"'));
  assertTrue(sqlQuery.sql.includes('"agg"."ownerId"'));
});

test("evoluJsonObjectFrom compiles a prefixed SQLite JSON object query", () => {
  const query = createQuery((db) =>
    db
      .selectFrom("person")
      .select(["person.id"])
      .select((eb) => [
        evoluJsonObjectFrom(
          eb
            .selectFrom("pet")
            .select(["id as petId", "name"])
            .whereRef("pet.ownerId", "=", "person.id"),
        ).as("favoritePet"),
      ]),
  );

  const sqlQuery = sqliteQueryStringToSqliteQuery(query);

  assertTrue(sqlQuery.sql.includes("json_object("));
  assertTrue(sqlQuery.sql.includes(kyselyJsonIdentifier));
  assertTrue(sqlQuery.sql.includes('"obj"."petId"'));
  assertTrue(sqlQuery.sql.includes('"obj"."name"'));
});

test("evoluJsonBuildObject compiles a prefixed SQLite json_object expression", () => {
  const query = createQuery((db) =>
    db.selectFrom("person").select((eb) => [
      evoluJsonBuildObject({
        first: eb.ref("name"),
        full: kyselySql<string>`name || '!'`,
      }).as("profile"),
    ]),
  );

  const sqlQuery = sqliteQueryStringToSqliteQuery(query);

  assertTrue(sqlQuery.sql.includes("json_object("));
  assertTrue(sqlQuery.sql.includes(kyselyJsonIdentifier));
  assertTrue(sqlQuery.sql.includes("'first'"));
  assertTrue(sqlQuery.sql.includes("'full'"));
});

test("getJsonObjectArgs handles alias, column, and reference selections", () => {
  let operationNode: SelectQueryNode | undefined;

  createQuery((db) => {
    const subquery = db
      .selectFrom("pet")
      .select((eb) => [eb.ref("id").as("petId"), "name", "pet.ownerId"]);

    operationNode = subquery.toOperationNode();
    return db.selectFrom("pet").select(["pet.id"]);
  });

  assertNotUndefined(operationNode);

  const args = getJsonObjectArgs(operationNode, "agg");

  assertLength(args, 6);
});

test("getJsonObjectArgs handles unqualified column selections", () => {
  const operationNode = {
    selections: [{ selection: ColumnNode.create("name") }],
  } as unknown as SelectQueryNode;

  const args = getJsonObjectArgs(operationNode, "agg");

  assertLength(args, 2);
});

test("getJsonObjectArgs rejects selections it cannot map to json_object", () => {
  let operationNode: SelectQueryNode | undefined;

  createQuery((db) => {
    const subquery = db.selectFrom("pet").selectAll();
    operationNode = subquery.toOperationNode();
    return db.selectFrom("pet").select(["pet.id"]);
  });

  assertNotUndefined(operationNode);
  const node = operationNode;

  assertTrue(
    assertThrowsInstanceOf(
      () => getJsonObjectArgs(node, "agg"),
      Error,
    ).message.includes("can't extract column names from the select query node"),
  );
});

test("getJsonObjectArgs returns empty array for nodes without selections", () => {
  let operationNode: SelectQueryNode | undefined;

  createQuery((db) => {
    operationNode = db.selectFrom("pet").toOperationNode();
    return db.selectFrom("pet").select(["pet.id"]);
  });

  assertNotUndefined(operationNode);

  assertEqual(getJsonObjectArgs(operationNode, "agg"), []);
});

test("evoluJsonArrayFrom rejects selectAll subqueries", () => {
  assertTrue(
    assertThrowsInstanceOf(
      () =>
        createQuery((db) =>
          db
            .selectFrom("person")
            .select((eb) => [
              evoluJsonArrayFrom(eb.selectFrom("pet").selectAll()).as("pets"),
            ]),
        ),
      Error,
    ).message.includes(
      "SQLite evoluJsonArrayFrom and evoluJsonObjectFrom can only handle explicit selections due to limitations of the json_object function. selectAll() is not allowed in the subquery.",
    ),
  );
});

test("makePatches", () => {
  const row: Row = { a: 1 };
  const rows: ReadonlyArray<Row> = [row];

  assertLength(makePatches([], []), 0);
  const p0 = [{ op: "replaceAll", value: [] }];
  assertEqual(makePatches(rows, []), p0);

  const p1 = makePatches([], rows);
  assertEqual(p1, [{ op: "replaceAll", value: rows }]);
  if (p1[0].op === "replaceAll") assertSame(p1[0].value, rows);

  assertLength(makePatches(rows, rows), 0);

  assertEqual(makePatches(rows, [{ a: 2 }]), [
    { op: "replaceAll", value: [{ a: 2 }] },
  ]);

  assertEqual(makePatches([row, { b: 2 }], [row, { b: 3 }]), [
    { op: "replaceAt", index: 1, value: { b: 3 } },
  ]);

  assertEqual(
    makePatches([{ a: 1 }, row, { c: 4 }], [{ a: 0 }, row, { c: 1 }]),
    [
      { op: "replaceAt", index: 0, value: { a: 0 } },
      { op: "replaceAt", index: 2, value: { c: 1 } },
    ],
  );

  assertLength(
    makePatches([{ a: new Uint8Array([1]) }], [{ a: new Uint8Array([1]) }]),
    0,
  );
});

test("makePatches handles undefined previous rows", () => {
  const rows: ReadonlyArray<Row> = [{ a: 1 }];
  const patches = makePatches(undefined, rows);

  assertEqual(patches, [{ op: "replaceAll", value: rows }]);
  if (patches[0].op === "replaceAll") assertSame(patches[0].value, rows);
});

test("applyPatches", () => {
  const current: ReadonlyArray<Row> = [];
  assertSame(applyPatches([], current), current);

  const value: ReadonlyArray<Row> = [];
  assertEqual(applyPatches([{ op: "replaceAll", value }], current), value);

  const replaceUntouched = { b: 2 };
  const replaceAtResult = applyPatches(
    [
      { op: "replaceAt", index: 0, value: { a: 2 } },
      { op: "replaceAt", index: 2, value: { c: 4 } },
    ],
    [{ a: 1 }, replaceUntouched, { c: 3 }],
  );
  assertEqual(replaceAtResult, [{ a: 2 }, { b: 2 }, { c: 4 }]);
  assertSame(replaceAtResult[1], replaceUntouched);
});

test("applyPatches parses prefixed JSON in strings, arrays, and objects", () => {
  const encodedObject = `${kyselyJsonIdentifier}{"x":1}`;
  const encodedArray = `${kyselyJsonIdentifier}[1,2]`;

  const result = applyPatches(
    [
      {
        op: "replaceAll",
        value: [
          {
            plain: "no-json",
            objectValue: encodedObject,
            arrayValue: [{ inside: encodedArray }],
            nested: { inside: encodedObject },
          },
        ],
      },
    ],
    [],
  );

  assertEqual(result, [
    {
      plain: "no-json",
      objectValue: { x: 1 },
      arrayValue: [{ inside: [1, 2] }],
      nested: { inside: { x: 1 } },
    },
  ]);
});

test("applyPatches recursively parses prefixed JSON inside decoded JSON", () => {
  const encodeJson = (value: unknown): string =>
    `${kyselyJsonIdentifier}${JSON.stringify(value)}`;

  const result = applyPatches(
    [
      {
        op: "replaceAll",
        value: [
          {
            nestedObject: encodeJson({
              items: [
                {
                  detail: encodeJson({ status: "ok" }),
                },
              ],
            }),
          },
        ],
      },
    ],
    [],
  );

  assertEqual(result, [
    {
      nestedObject: {
        items: [
          {
            detail: { status: "ok" },
          },
        ],
      },
    },
  ]);
});
