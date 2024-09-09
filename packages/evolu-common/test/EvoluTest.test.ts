import { describe, it, expect } from "vitest";
import { createTestEvolu } from "../src/EvoluTest.js";
import { cast, database, id, NonEmptyString1000, table } from "../src/Model.js";
import { Schema } from "@effect/schema";
import { Effect } from "effect";
import { Evolu } from "../src/Evolu.js";

const todoId = id("Todo");
const todoTable = table({
  id: todoId,
  title: NonEmptyString1000,
});
const db = database({
  todo: todoTable,
});
type Database = (typeof db)["Type"];

const createTodo = (name: string, evolu: Evolu<Database>) => {
  return Effect.gen(function* () {
    const title = yield* Schema.decode(NonEmptyString1000)("test title");
    return evolu.create("todo", { title });
  }).pipe(Effect.runSync);
};

describe("createTestEvolu", () => {
  it("creates a testing evolu that works as expected", async () => {
    const evolu = createTestEvolu(db, {});

    const result = createTodo("test title", evolu);

    const query = evolu.createQuery((db) =>
      db
        .selectFrom("todo")
        .where("isDeleted", "is not", cast(true))
        .selectAll()
        .limit(1),
    );
    const queryResult = await evolu.loadQuery(query);

    expect(queryResult.row?.id).toEqual(result.id);

    evolu.update("todo", { id: result.id, isDeleted: true });

    expect(await evolu.loadQuery(query)).toMatchObject({ rows: [] });
  });

  it("creates the database completely new each time", async () => {
    const evoluOne = createTestEvolu(db, {});

    const todo = createTodo("Test title", evoluOne);
    const query = evoluOne.createQuery((db) =>
      db.selectFrom("todo").selectAll(),
    );
    const queryResult = await evoluOne.loadQuery(query);
    expect(queryResult?.row?.id).toEqual(todo.id);

    const evoluTwo = createTestEvolu(db, {});

    const newQuery = evoluTwo.createQuery((db) =>
      db.selectFrom("todo").selectAll(),
    );
    const newQueryResult = await evoluTwo.loadQuery(newQuery);

    expect(newQueryResult.row).toBeUndefined();
  });
});
