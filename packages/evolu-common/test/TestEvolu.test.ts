import { describe, it, expect, beforeEach } from "vitest";
import { createTestEvolu } from "../src/TestEvolu.js";
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

const createTodo = (
  name: string,
  evolu: Evolu<Database>,
  callback?: () => void,
) => {
  return Effect.gen(function* () {
    const title = yield* Schema.decode(NonEmptyString1000)(name);
    return evolu.create("todo", { title }, callback);
  }).pipe(Effect.runSync);
};

const createTodoAsync = (
  name: string,
  evolu: Evolu<Database>,
  callback?: () => void,
) => {
  return new Promise<void>((resolve) => {
    createTodo(name, evolu, resolve);
  });
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

  describe("forking", async () => {
    const parent = createTestEvolu(db, {});
    createTodo("Example One", parent);
    createTodo("Example Two", parent);

    it("includes the data from the parent", async () => {
      const fork = await parent.fork();

      const query = fork.createQuery((db) => db.selectFrom("todo").selectAll());
      const queryResult = await fork.loadQuery(query);
      expect(queryResult.rows).toHaveLength(2);
    });

    it("does not modify the parent when the fork is mutated", async () => {
      const fork = await parent.fork();

      await createTodoAsync("New Other Todo", fork);

      const parentQuery = parent.createQuery((db) =>
        db.selectFrom("todo").selectAll(),
      );
      const parentQueryResult = await parent.loadQuery(parentQuery);
      expect(parentQueryResult.rows).toHaveLength(2);

      const forkQuery = fork.createQuery((db) =>
        db.selectFrom("todo").selectAll(),
      );
      const forkQueryResult = await fork.loadQuery(forkQuery);
      expect(forkQueryResult.rows).toHaveLength(3);
    });

    it("does not modify the fork if the parent is mutated", async () => {
      const parent = createTestEvolu(db, {});
      const fork = await parent.fork();

      await createTodoAsync("New Todo", parent);

      const forkQuery = fork.createQuery((db) =>
        db.selectFrom("todo").selectAll(),
      );
      const forkQueryResult = await fork.loadQuery(forkQuery);
      expect(forkQueryResult.rows).toHaveLength(0);

      const parentQuery = parent.createQuery((db) =>
        db.selectFrom("todo").selectAll(),
      );
      const parentQueryResult = await parent.loadQuery(parentQuery);
      expect(parentQueryResult.rows).toHaveLength(1);
    });

    describe("multiple forks", () => {
      it("the forks are independent", async () => {
        const forkOne = await parent.fork();
        const forkTwo = await parent.fork();

        await createTodoAsync("Todo in Fork One", forkOne);
        await createTodoAsync("Todo in Fork Two", forkTwo);

        const forkOneQuery = forkOne.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );

        const forkOneQueryResult = await forkOne.loadQuery(forkOneQuery);
        expect(forkOneQueryResult.rows.map((x) => x.title)).toContain(
          "Todo in Fork One",
        );
        expect(forkOneQueryResult.rows.map((x) => x.title)).not.toContain(
          "Todo in Fork Two",
        );

        const forkTwoQuery = forkTwo.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );
        const forkTwoQueryResult = await forkTwo.loadQuery(forkTwoQuery);
        expect(forkTwoQueryResult.rows.map((x) => x.title)).toContain(
          "Todo in Fork Two",
        );
        expect(forkTwoQueryResult.rows.map((x) => x.title)).not.toContain(
          "Todo in Fork One",
        );
      });

      it("both forks include the same parent data", async () => {
        const forkOne = await parent.fork();
        const forkTwo = await parent.fork();

        const forkOneQuery = forkOne.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );

        const forkOneQueryResult = await forkOne.loadQuery(forkOneQuery);
        expect(forkOneQueryResult.rows.map((x) => x.title)).toContain(
          "Example One",
        );
        expect(forkOneQueryResult.rows).toHaveLength(2);

        const forkTwoQuery = forkTwo.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );

        const forkTwoQueryResult = await forkTwo.loadQuery(forkTwoQuery);
        expect(forkTwoQueryResult.rows.map((x) => x.title)).toContain(
          "Example One",
        );
        expect(forkTwoQueryResult.rows).toHaveLength(2);
      });
    });

    describe("nested forks", async () => {
      const parentFork = await parent.fork();

      it("includes the data from the parent", async () => {
        const fork = await parentFork.fork();

        const query = fork.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );
        const queryResult = await fork.loadQuery(query);
        expect(queryResult.rows).toHaveLength(2);
      });

      it("does not modify the parent fork or the parent's parent", async () => {
        const fork = await parentFork.fork();

        await createTodoAsync("New Todo", fork);

        const parentQuery = parent.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );
        const parentQueryResult = await parent.loadQuery(parentQuery);
        expect(parentQueryResult.rows).toHaveLength(2);

        const parentForkQuery = parentFork.createQuery((db) =>
          db.selectFrom("todo").selectAll(),
        );
        const parentForkQueryResult =
          await parentFork.loadQuery(parentForkQuery);
        expect(parentForkQueryResult.rows).toHaveLength(2);
      });
    });
  });
});
