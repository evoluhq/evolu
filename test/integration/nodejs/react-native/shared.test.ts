import { describe, it } from "node:test";
import {
  assertEqual,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import {
  createEvolu,
  testAppName,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import { testAppOwner } from "../../../../packages/common/src/local-first/Owner.ts";
import { createQueryBuilder } from "../../../../packages/common/src/local-first/Schema.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import { createRun, sleep } from "../../../../packages/common/src/Task.ts";
import {
  id,
  NonEmptyTrimmedString100,
} from "../../../../packages/common/src/Type.ts";
import { createEvoluDeps } from "../../../../packages/react-native/src/shared.ts";
import { testCreateSqliteDep } from "../_deps.ts";

installPolyfills();

const Schema = {
  todo: {
    id: id("Todo"),
    title: NonEmptyTrimmedString100,
  },
};

const todoTitlesQuery = createQueryBuilder(Schema)((db) =>
  db.selectFrom("todo").select(["title"]),
);

describe("createEvoluDeps", () => {
  it("reopens a database after deps created again replaced its tab leader", async () => {
    let openCount = 0;
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: (name, options) => {
          openCount += 1;
          return testCreateSqliteDep.createSqliteDriver(name, options);
        },
      });
    const createTodoEvolu = createEvolu(Schema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });

    {
      using deps = createDeps();
      await using run = createRun(deps);
      await using evolu = await run.ok(createTodoEvolu);
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
    }

    // The first deps' DbWorker keeps the database open, so the replacement
    // hosted by the new tab leader waits for its lock.
    using deps = createDeps();
    await using run = createRun(deps);
    {
      await using evolu = await run.ok(createTodoEvolu);
      assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
    }

    // Past the idle disposal of the database's tenant. The replacement opens
    // the database once the first DbWorker releases it, then is told to stop.
    await run.ok(sleep("4s"));
    const openedAfterIdle = openCount;

    await using evolu = await run.ok(createTodoEvolu);
    assertEqual(await evolu.loadQuery(todoTitlesQuery), []);
    // A DbWorker hosted by the new tab leader reopened the database.
    assertTrue(openCount > openedAfterIdle);
  });
});
