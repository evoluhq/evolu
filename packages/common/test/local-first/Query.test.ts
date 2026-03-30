import { ColumnNode, type SelectQueryNode } from "kysely";
import { expect, test } from "vitest";
import type { Query, Row } from "../../src/local-first/Query.js";
import {
  applyPatches,
  evoluJsonArrayFrom,
  evoluJsonBuildObject,
  evoluJsonObjectFrom,
  getJsonObjectArgs,
  kyselyJsonIdentifier,
  kyselySql,
  makePatches,
} from "../../src/local-first/Query.js";
import { createQueryBuilder } from "../../src/local-first/Schema.js";
import { sqliteQueryStringToSqliteQuery } from "../../src/Sqlite.js";
import { id, NonEmptyString100 } from "../../src/Type.js";

const PersonId = id("Person");
const PetId = id("Pet");

const QuerySchema = {
  person: {
    id: PersonId,
    name: NonEmptyString100,
  },
  pet: {
    id: PetId,
    name: NonEmptyString100,
    ownerId: PersonId,
  },
};

const createQuery = createQueryBuilder(QuerySchema);

const NoteId = id("Note");
const AnotherQuerySchema = {
  note: {
    id: NoteId,
    title: NonEmptyString100,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const shouldError: typeof query2 = query1;

  // @ts-expect-error - query2 should not be assignable to query1
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const shouldAlsoError: typeof query1 = query2;

  // Valid assignments
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const validQuery1: typeof query1 = query1;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const validQuery2: typeof query2 = query2;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const validSchemaQuery: Query<typeof QuerySchema> = query1;
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

  expect(sqlQuery.sql).toContain("json_group_array(json_object(");
  expect(sqlQuery.sql).toContain(kyselyJsonIdentifier);
  expect(sqlQuery.sql).toContain('"agg"."petId"');
  expect(sqlQuery.sql).toContain('"agg"."name"');
  expect(sqlQuery.sql).toContain('"agg"."ownerId"');
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

  expect(sqlQuery.sql).toContain("json_object(");
  expect(sqlQuery.sql).toContain(kyselyJsonIdentifier);
  expect(sqlQuery.sql).toContain('"obj"."petId"');
  expect(sqlQuery.sql).toContain('"obj"."name"');
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

  expect(sqlQuery.sql).toContain("json_object(");
  expect(sqlQuery.sql).toContain(kyselyJsonIdentifier);
  expect(sqlQuery.sql).toContain("'first'");
  expect(sqlQuery.sql).toContain("'full'");
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

  expect(operationNode).toBeDefined();
  if (!operationNode) throw new Error("Expected operation node");

  const args = getJsonObjectArgs(operationNode, "agg");

  expect(args).toHaveLength(6);
});

test("getJsonObjectArgs handles unqualified column selections", () => {
  const operationNode = {
    selections: [{ selection: ColumnNode.create("name") }],
  } as unknown as SelectQueryNode;

  const args = getJsonObjectArgs(operationNode, "agg");

  expect(args).toHaveLength(2);
});

test("getJsonObjectArgs rejects selections it cannot map to json_object", () => {
  let operationNode: SelectQueryNode | undefined;

  createQuery((db) => {
    const subquery = db.selectFrom("pet").selectAll();
    operationNode = subquery.toOperationNode();
    return db.selectFrom("pet").select(["pet.id"]);
  });

  expect(operationNode).toBeDefined();
  if (!operationNode) throw new Error("Expected operation node");
  const node = operationNode;

  expect(() => getJsonObjectArgs(node, "agg")).toThrow(
    "can't extract column names from the select query node",
  );
});

test("getJsonObjectArgs returns empty array for nodes without selections", () => {
  let operationNode: SelectQueryNode | undefined;

  createQuery((db) => {
    operationNode = db.selectFrom("pet").toOperationNode();
    return db.selectFrom("pet").select(["pet.id"]);
  });

  expect(operationNode).toBeDefined();
  if (!operationNode) throw new Error("Expected operation node");

  expect(getJsonObjectArgs(operationNode, "agg")).toEqual([]);
});

test("evoluJsonArrayFrom rejects selectAll subqueries", () => {
  expect(() =>
    createQuery((db) =>
      db
        .selectFrom("person")
        .select((eb) => [
          evoluJsonArrayFrom(eb.selectFrom("pet").selectAll()).as("pets"),
        ]),
    ),
  ).toThrow(
    "SQLite evoluJsonArrayFrom and evoluJsonObjectFrom can only handle explicit selections due to limitations of the json_object function. selectAll() is not allowed in the subquery.",
  );
});

test("makePatches", () => {
  const row: Row = { a: 1 };
  const rows: ReadonlyArray<Row> = [row];

  expect(makePatches([], []).length).toBe(0);
  const p0 = [{ op: "replaceAll", value: [] }];
  expect(makePatches(rows, [])).toEqual(p0);

  const p1 = makePatches([], rows);
  expect(p1).toEqual([{ op: "replaceAll", value: rows }]);
  if (p1[0].op === "replaceAll") expect(p1[0].value).toBe(rows);

  expect(makePatches(rows, rows).length).toBe(0);

  expect(makePatches(rows, [{ a: 2 }])).toMatchSnapshot();

  expect(makePatches([row, { b: 2 }], [row, { b: 3 }])).toMatchSnapshot();

  expect(
    makePatches([{ a: 1 }, row, { c: 4 }], [{ a: 0 }, row, { c: 1 }]),
  ).toMatchSnapshot();

  expect(
    makePatches([{ a: new Uint8Array([1]) }], [{ a: new Uint8Array([1]) }])
      .length,
  ).toBe(0);
});

test("makePatches handles undefined previous rows", () => {
  const rows: ReadonlyArray<Row> = [{ a: 1 }];
  const patches = makePatches(undefined, rows);

  expect(patches).toEqual([{ op: "replaceAll", value: rows }]);
  if (patches[0].op === "replaceAll") expect(patches[0].value).toBe(rows);
});

test("applyPatches", () => {
  const current: ReadonlyArray<Row> = [];
  expect(applyPatches([], current)).toBe(current);

  const value: ReadonlyArray<Row> = [];
  expect(applyPatches([{ op: "replaceAll", value }], current)).toStrictEqual(
    value,
  );

  const replaceUntouched = { b: 2 };
  const replaceAtResult = applyPatches(
    [
      { op: "replaceAt", index: 0, value: { a: 2 } },
      { op: "replaceAt", index: 2, value: { c: 4 } },
    ],
    [{ a: 1 }, replaceUntouched, { c: 3 }],
  );
  expect(replaceAtResult).toEqual([{ a: 2 }, { b: 2 }, { c: 4 }]);
  expect(replaceAtResult[1]).toBe(replaceUntouched);
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

  expect(result).toEqual([
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

  expect(result).toEqual([
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
