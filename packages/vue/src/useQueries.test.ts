import {
  assertEqual,
  assertNotUndefined,
  createQueryBuilder,
  testEvoluSchema,
} from "@evolu/common";
import type {
  Evolu,
  EvoluApp,
  Query,
  QueryRows,
} from "@evolu/common/local-first";
import { test } from "node:test";
import { createApp, effectScope } from "vue";
import { EvoluAppContext } from "./EvoluAppProvider.ts";
import { EvoluContext } from "./provideEvolu.ts";
import { useDeviceQueries, useQueries } from "./useQueries.ts";

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
const allProjects = createQuery((db) => db.selectFrom("project").selectAll());
const todoRows = [{ id: "todo" }] as unknown as QueryRows<typeof allTodos.Row>;
const projectRows = [{ id: "project" }] as unknown as QueryRows<
  typeof allProjects.Row
>;

/** An Evolu stub that records which queries it loads and subscribes to. */
const setupEvolu = () => {
  const loaded: Array<string> = [];
  const subscribed: Array<string> = [];
  const nameOf = (query: Query<any, any>) =>
    query === allTodos ? "todos" : "projects";
  const rowsOf = (query: Query<any, any>) =>
    query === allTodos ? todoRows : projectRows;
  // Only loadQuery, subscribeQuery, and getQueryRows are used by the
  // composables.
  const evolu = {
    loadQuery: (query: Query<any, any>) => {
      loaded.push(nameOf(query));
      return Promise.resolve(rowsOf(query));
    },
    subscribeQuery: (query: Query<any, any>) => () => {
      subscribed.push(nameOf(query));
      return () => {
        subscribed.splice(subscribed.indexOf(nameOf(query)), 1);
      };
    },
    getQueryRows: rowsOf,
  } as unknown as Evolu;

  return { evolu, loaded, subscribed };
};

test("useQueries loads the queries and subscribes to all but the once ones", async () => {
  const { evolu, loaded, subscribed } = setupEvolu();
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();

  const result = app.runWithContext(() =>
    scope.run(() => useQueries([allTodos], { once: [allProjects] })),
  );
  assertNotUndefined(result);
  assertEqual(loaded, ["todos", "projects"]);
  assertEqual(subscribed, ["todos"]);
  await Promise.resolve();
  assertEqual(
    result.map((rows) => rows.value),
    [todoRows, projectRows],
  );

  scope.stop();
  assertEqual(subscribed, []);
});

test("useDeviceQueries loads and subscribes to queries of the device instance", async () => {
  const { evolu: device, loaded, subscribed } = setupEvolu();
  const app = createApp({});
  // Only device is used by the composables.
  app.provide(EvoluAppContext, { device } as unknown as EvoluApp<any, any>);
  const scope = effectScope();

  const result = app.runWithContext(() =>
    scope.run(() => useDeviceQueries([allTodos], { once: [allProjects] })),
  );
  assertNotUndefined(result);
  assertEqual(loaded, ["todos", "projects"]);
  assertEqual(subscribed, ["todos"]);
  await Promise.resolve();
  assertEqual(
    result.map((rows) => rows.value),
    [todoRows, projectRows],
  );

  scope.stop();
  assertEqual(subscribed, []);
});
