import {
  assertEqual,
  assertNotUndefined,
  assertSame,
  createQueryBuilder,
  emptyArray,
  testEvoluSchema,
} from "@evolu/common";
import type { Evolu, QueryRows } from "@evolu/common/local-first";
import { test } from "node:test";
import { createApp, createSSRApp, effectScope, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { EvoluContext } from "./provideEvolu.ts";
import { useQuery } from "./useQuery.ts";

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
const rows = [{ id: "todo" }] as unknown as QueryRows<typeof allTodos.Row>;

/** An Evolu stub whose loads and subscriptions are counted. */
const setupEvolu = () => {
  let loadCount = 0;
  let listenerCount = 0;
  // Only loadQuery, subscribeQuery, and getQueryRows are used by the composable.
  const evolu = {
    loadQuery: () => {
      loadCount++;
      return Promise.resolve(rows);
    },
    subscribeQuery: () => () => {
      listenerCount++;
      return () => {
        listenerCount--;
      };
    },
    getQueryRows: () => rows,
  } as unknown as Evolu;

  return {
    evolu,
    loadCount: () => loadCount,
    listenerCount: () => listenerCount,
  };
};

test("loads the query and subscribes until its scope is disposed", async () => {
  const { evolu, listenerCount } = setupEvolu();
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();

  const result = app.runWithContext(() => scope.run(() => useQuery(allTodos)));
  assertNotUndefined(result);
  assertSame(result.value, emptyArray);
  assertSame(listenerCount(), 1);
  await Promise.resolve();
  assertSame(result.value, rows);

  scope.stop();
  assertSame(listenerCount(), 0);
});

test("only loads the query during server rendering", async () => {
  const { evolu, loadCount, listenerCount } = setupEvolu();
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const result = useQuery(allTodos);
      return () => h("p", result.value.length);
    },
  });
  app.provide(EvoluContext, evolu);

  assertEqual(await renderToString(app), "<p>0</p>");
  assertSame(loadCount(), 1);
  assertSame(listenerCount(), 0);
});
